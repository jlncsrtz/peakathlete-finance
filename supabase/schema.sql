-- PeakAthlete Finance - Supabase/PostgreSQL schema
-- Run this entire file once in Supabase Dashboard -> SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  expense_number text not null unique,
  receipt_reference text not null default '',
  vendor text not null,
  expense_type text not null,
  category text not null,
  subcategory text not null default '',
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_cost_cents bigint not null check (unit_cost_cents >= 0),
  tax_fees_cents bigint not null default 0 check (tax_fees_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  amount_paid_cents bigint not null default 0 check (amount_paid_cents >= 0),
  payment_method text not null,
  payment_status text not null,
  product_collection text not null default '',
  receipt_url text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monthly_budgets (
  month text primary key check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount_cents bigint not null check (amount_cents >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text not null unique,
  variant text not null default '',
  cost_cents bigint not null default 0 check (cost_cents >= 0),
  selling_price_cents bigint not null default 0 check (selling_price_cents >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  order_date date not null,
  order_number text not null unique,
  external_order_id text unique,
  source text not null default 'Manual',
  customer_name text not null default '',
  sales_channel text not null default 'Direct',
  order_status text not null default 'Pending',
  payment_status text not null default 'Unpaid',
  payment_method text not null default 'Cash',
  shipping_method text not null default '',
  items_summary text not null default '',
  subtotal_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  shipping_fee_cents bigint not null default 0,
  transaction_fee_cents bigint not null default 0,
  total_cents bigint not null default 0,
  net_sales_cents bigint not null default 0,
  amount_paid_cents bigint not null default 0,
  inventory_applied integer not null default 0 check (inventory_applied in (0, 1)),
  notes text not null default '',
  paid_at text not null default '',
  delivered_at text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  sku text not null default '',
  variant text not null default '',
  quantity integer not null default 1 check (quantity > 0),
  unit_price_cents bigint not null default 0,
  unit_cost_cents bigint not null default 0,
  line_total_cents bigint not null default 0
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  order_id uuid references public.sales_orders(id) on delete set null,
  movement_type text not null,
  quantity_delta integer not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_expenses_date on public.expenses(expense_date);
create index if not exists idx_expenses_type_date on public.expenses(expense_type, expense_date);
create index if not exists idx_expenses_status_date on public.expenses(payment_status, expense_date);
create index if not exists idx_expenses_category on public.expenses(category);
create index if not exists idx_products_name on public.products(name);
create index if not exists idx_sales_orders_date on public.sales_orders(order_date);
create index if not exists idx_sales_orders_status_date on public.sales_orders(order_status, order_date);
create index if not exists idx_sales_orders_payment_date on public.sales_orders(payment_status, order_date);
create index if not exists idx_sales_items_order on public.sales_items(order_id);
create index if not exists idx_sales_items_product on public.sales_items(product_id);
create index if not exists idx_inventory_movements_product_date on public.inventory_movements(product_id, created_at desc);
create index if not exists idx_inventory_movements_order on public.inventory_movements(order_id);

-- Keep the database private. The Next.js API routes use the server-only service role key.
alter table public.expenses enable row level security;
alter table public.monthly_budgets enable row level security;
alter table public.products enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_items enable row level security;
alter table public.inventory_movements enable row level security;

revoke all on table public.expenses, public.monthly_budgets, public.products,
  public.sales_orders, public.sales_items, public.inventory_movements from anon, authenticated;
grant all on table public.expenses, public.monthly_budgets, public.products,
  public.sales_orders, public.sales_items, public.inventory_movements to service_role;

-- Private bucket used by /api/receipts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Atomic stock adjustment.
create or replace function public.pa_adjust_inventory(
  p_product_id uuid,
  p_quantity_delta integer,
  p_reason text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock integer;
  v_next integer;
  v_applied integer;
begin
  select stock_quantity into v_stock
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found.';
  end if;

  v_next := greatest(v_stock + p_quantity_delta, 0);
  v_applied := v_next - v_stock;

  if v_applied = 0 then
    return v_stock;
  end if;

  update public.products
  set stock_quantity = v_next, updated_at = now()
  where id = p_product_id;

  insert into public.inventory_movements
    (id, product_id, order_id, movement_type, quantity_delta, reason, created_at)
  values
    (gen_random_uuid(), p_product_id, null,
     case when v_applied > 0 then 'Stock In' else 'Stock Out' end,
     v_applied, p_reason, now());

  return v_next;
end;
$$;

-- Atomic manual order creation including inventory updates.
create or replace function public.pa_create_order(
  p_order jsonb,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := (p_order->>'id')::uuid;
  v_apply integer := coalesce((p_order->>'inventory_applied')::integer, 0);
  v_check record;
  v_item record;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order item is required.';
  end if;

  if v_apply = 1 then
    for v_check in
      select x.product_id, sum(x.quantity)::integer as quantity
      from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)
      group by x.product_id
    loop
      perform 1 from public.products where id = v_check.product_id for update;
      if not found then raise exception 'A selected product no longer exists.'; end if;
      if (select stock_quantity from public.products where id = v_check.product_id) < v_check.quantity then
        raise exception 'Not enough stock for %.', (select name from public.products where id = v_check.product_id);
      end if;
    end loop;
  end if;

  insert into public.sales_orders (
    id, order_date, order_number, external_order_id, source, customer_name, sales_channel,
    order_status, payment_status, payment_method, shipping_method, items_summary,
    subtotal_cents, discount_cents, shipping_fee_cents, transaction_fee_cents,
    total_cents, net_sales_cents, amount_paid_cents, inventory_applied, notes,
    paid_at, delivered_at, created_at, updated_at
  ) values (
    v_id,
    (p_order->>'order_date')::date,
    p_order->>'order_number',
    nullif(p_order->>'external_order_id', ''),
    coalesce(nullif(p_order->>'source', ''), 'Manual'),
    coalesce(p_order->>'customer_name', ''),
    coalesce(p_order->>'sales_channel', 'Direct'),
    coalesce(p_order->>'order_status', 'Pending'),
    coalesce(p_order->>'payment_status', 'Unpaid'),
    coalesce(p_order->>'payment_method', 'Cash'),
    coalesce(p_order->>'shipping_method', ''),
    coalesce(p_order->>'items_summary', ''),
    coalesce((p_order->>'subtotal_cents')::bigint, 0),
    coalesce((p_order->>'discount_cents')::bigint, 0),
    coalesce((p_order->>'shipping_fee_cents')::bigint, 0),
    coalesce((p_order->>'transaction_fee_cents')::bigint, 0),
    coalesce((p_order->>'total_cents')::bigint, 0),
    coalesce((p_order->>'net_sales_cents')::bigint, 0),
    coalesce((p_order->>'amount_paid_cents')::bigint, 0),
    v_apply,
    coalesce(p_order->>'notes', ''),
    coalesce(p_order->>'paid_at', ''),
    coalesce(p_order->>'delivered_at', ''),
    coalesce((p_order->>'created_at')::timestamptz, now()),
    coalesce((p_order->>'updated_at')::timestamptz, now())
  );

  insert into public.sales_items (
    id, order_id, product_id, product_name, sku, variant, quantity,
    unit_price_cents, unit_cost_cents, line_total_cents
  )
  select x.id, v_id, x.product_id, x.product_name, x.sku, x.variant, x.quantity,
         x.unit_price_cents, x.unit_cost_cents, x.line_total_cents
  from jsonb_to_recordset(p_items) as x(
    id uuid, product_id uuid, product_name text, sku text, variant text,
    quantity integer, unit_price_cents bigint, unit_cost_cents bigint, line_total_cents bigint
  );

  if v_apply = 1 then
    for v_item in
      select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)
    loop
      update public.products
      set stock_quantity = stock_quantity - v_item.quantity, updated_at = now()
      where id = v_item.product_id;

      insert into public.inventory_movements
        (id, product_id, order_id, movement_type, quantity_delta, reason, created_at)
      values
        (gen_random_uuid(), v_item.product_id, v_id, 'Sale', -v_item.quantity,
         p_order->>'order_number', now());
    end loop;
  end if;

  return v_id;
end;
$$;

-- Atomic manual order edit. Existing applied inventory is restored first, then the new state is applied.
create or replace function public.pa_update_order(
  p_order_id uuid,
  p_order jsonb,
  p_items jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_apply integer;
  v_old_number text;
  v_new_apply integer := coalesce((p_order->>'inventory_applied')::integer, 0);
  v_new record;
  v_old record;
  v_item record;
  v_stock integer;
  v_old_qty integer;
begin
  select inventory_applied, order_number
  into v_old_apply, v_old_number
  from public.sales_orders
  where id = p_order_id
  for update;

  if not found then raise exception 'Sale not found.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order item is required.';
  end if;

  if v_new_apply = 1 then
    for v_new in
      select x.product_id, sum(x.quantity)::integer as quantity
      from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)
      group by x.product_id
    loop
      select stock_quantity into v_stock
      from public.products where id = v_new.product_id for update;
      if not found then raise exception 'A selected product no longer exists.'; end if;

      select coalesce(sum(quantity), 0)::integer into v_old_qty
      from public.sales_items
      where order_id = p_order_id and product_id = v_new.product_id;

      if v_stock + (case when v_old_apply = 1 then v_old_qty else 0 end) < v_new.quantity then
        raise exception 'Not enough stock for %.', (select name from public.products where id = v_new.product_id);
      end if;
    end loop;
  end if;

  if v_old_apply = 1 then
    for v_old in
      select product_id, quantity from public.sales_items
      where order_id = p_order_id and product_id is not null
    loop
      update public.products
      set stock_quantity = stock_quantity + v_old.quantity, updated_at = now()
      where id = v_old.product_id;

      insert into public.inventory_movements
        (id, product_id, order_id, movement_type, quantity_delta, reason, created_at)
      values
        (gen_random_uuid(), v_old.product_id, p_order_id, 'Sale Reversal', v_old.quantity,
         coalesce(nullif(p_order->>'order_number', ''), v_old_number), now());
    end loop;
  end if;

  delete from public.sales_items where order_id = p_order_id;

  update public.sales_orders set
    order_date = (p_order->>'order_date')::date,
    order_number = coalesce(nullif(p_order->>'order_number', ''), v_old_number),
    customer_name = coalesce(p_order->>'customer_name', ''),
    sales_channel = coalesce(p_order->>'sales_channel', 'Direct'),
    order_status = coalesce(p_order->>'order_status', 'Pending'),
    payment_status = coalesce(p_order->>'payment_status', 'Unpaid'),
    payment_method = coalesce(p_order->>'payment_method', 'Cash'),
    shipping_method = coalesce(p_order->>'shipping_method', ''),
    items_summary = coalesce(p_order->>'items_summary', ''),
    subtotal_cents = coalesce((p_order->>'subtotal_cents')::bigint, 0),
    discount_cents = coalesce((p_order->>'discount_cents')::bigint, 0),
    shipping_fee_cents = coalesce((p_order->>'shipping_fee_cents')::bigint, 0),
    transaction_fee_cents = coalesce((p_order->>'transaction_fee_cents')::bigint, 0),
    total_cents = coalesce((p_order->>'total_cents')::bigint, 0),
    net_sales_cents = coalesce((p_order->>'net_sales_cents')::bigint, 0),
    amount_paid_cents = coalesce((p_order->>'amount_paid_cents')::bigint, 0),
    inventory_applied = v_new_apply,
    notes = coalesce(p_order->>'notes', ''),
    paid_at = coalesce(p_order->>'paid_at', ''),
    delivered_at = coalesce(p_order->>'delivered_at', ''),
    updated_at = coalesce((p_order->>'updated_at')::timestamptz, now())
  where id = p_order_id;

  insert into public.sales_items (
    id, order_id, product_id, product_name, sku, variant, quantity,
    unit_price_cents, unit_cost_cents, line_total_cents
  )
  select x.id, p_order_id, x.product_id, x.product_name, x.sku, x.variant, x.quantity,
         x.unit_price_cents, x.unit_cost_cents, x.line_total_cents
  from jsonb_to_recordset(p_items) as x(
    id uuid, product_id uuid, product_name text, sku text, variant text,
    quantity integer, unit_price_cents bigint, unit_cost_cents bigint, line_total_cents bigint
  );

  if v_new_apply = 1 then
    for v_item in
      select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)
    loop
      update public.products
      set stock_quantity = stock_quantity - v_item.quantity, updated_at = now()
      where id = v_item.product_id;

      insert into public.inventory_movements
        (id, product_id, order_id, movement_type, quantity_delta, reason, created_at)
      values
        (gen_random_uuid(), v_item.product_id, p_order_id, 'Sale', -v_item.quantity,
         coalesce(nullif(p_order->>'order_number', ''), v_old_number), now());
    end loop;
  end if;
end;
$$;

create or replace function public.pa_delete_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_apply integer;
  v_number text;
  v_item record;
begin
  select inventory_applied, order_number into v_apply, v_number
  from public.sales_orders where id = p_order_id for update;
  if not found then raise exception 'Sale not found.'; end if;

  if v_apply = 1 then
    for v_item in
      select product_id, quantity from public.sales_items
      where order_id = p_order_id and product_id is not null
    loop
      update public.products
      set stock_quantity = stock_quantity + v_item.quantity, updated_at = now()
      where id = v_item.product_id;

      insert into public.inventory_movements
        (id, product_id, order_id, movement_type, quantity_delta, reason, created_at)
      values
        (gen_random_uuid(), v_item.product_id, null, 'Sale Deleted', v_item.quantity, v_number, now());
    end loop;
  end if;

  delete from public.sales_orders where id = p_order_id;
end;
$$;

-- Atomic Enstack import/upsert. Imported orders never adjust local inventory.
create or replace function public.pa_import_enstack_order(
  p_order jsonb,
  p_item jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_source text;
  v_inventory_applied integer;
  v_exists boolean := false;
  v_old_item record;
  v_action text;
  v_external text := p_order->>'external_order_id';
begin
  select id, source, inventory_applied into v_id, v_source, v_inventory_applied
  from public.sales_orders
  where external_order_id = v_external or order_number = v_external
  limit 1
  for update;

  v_exists := found;

  if v_exists and v_source <> 'Enstack' then
    raise exception 'manual_conflict';
  end if;

  if v_exists and v_inventory_applied = 1 then
    for v_old_item in
      select product_id, quantity from public.sales_items
      where order_id = v_id and product_id is not null
    loop
      update public.products
      set stock_quantity = stock_quantity + v_old_item.quantity, updated_at = now()
      where id = v_old_item.product_id;

      insert into public.inventory_movements
        (id, product_id, order_id, movement_type, quantity_delta, reason, created_at)
      values
        (gen_random_uuid(), v_old_item.product_id, v_id, 'Import Reversal', v_old_item.quantity,
         v_external, now());
    end loop;
  end if;

  if v_exists then
    v_action := 'updated';
    update public.sales_orders set
      order_date = (p_order->>'order_date')::date,
      customer_name = '',
      sales_channel = 'Enstack',
      order_status = p_order->>'order_status',
      payment_status = p_order->>'payment_status',
      payment_method = p_order->>'payment_method',
      shipping_method = coalesce(p_order->>'shipping_method', ''),
      items_summary = coalesce(p_order->>'items_summary', ''),
      subtotal_cents = (p_order->>'subtotal_cents')::bigint,
      discount_cents = (p_order->>'discount_cents')::bigint,
      shipping_fee_cents = (p_order->>'shipping_fee_cents')::bigint,
      transaction_fee_cents = (p_order->>'transaction_fee_cents')::bigint,
      total_cents = (p_order->>'total_cents')::bigint,
      net_sales_cents = (p_order->>'net_sales_cents')::bigint,
      amount_paid_cents = (p_order->>'amount_paid_cents')::bigint,
      inventory_applied = 0,
      notes = coalesce(p_order->>'notes', ''),
      paid_at = coalesce(p_order->>'paid_at', ''),
      delivered_at = coalesce(p_order->>'delivered_at', ''),
      updated_at = coalesce((p_order->>'updated_at')::timestamptz, now())
    where id = v_id;
  else
    v_action := 'imported';
    v_id := (p_order->>'id')::uuid;
    insert into public.sales_orders (
      id, order_date, order_number, external_order_id, source, customer_name, sales_channel,
      order_status, payment_status, payment_method, shipping_method, items_summary,
      subtotal_cents, discount_cents, shipping_fee_cents, transaction_fee_cents,
      total_cents, net_sales_cents, amount_paid_cents, inventory_applied, notes,
      paid_at, delivered_at, created_at, updated_at
    ) values (
      v_id, (p_order->>'order_date')::date, v_external, v_external, 'Enstack', '', 'Enstack',
      p_order->>'order_status', p_order->>'payment_status', p_order->>'payment_method',
      coalesce(p_order->>'shipping_method', ''), coalesce(p_order->>'items_summary', ''),
      (p_order->>'subtotal_cents')::bigint, (p_order->>'discount_cents')::bigint,
      (p_order->>'shipping_fee_cents')::bigint, (p_order->>'transaction_fee_cents')::bigint,
      (p_order->>'total_cents')::bigint, (p_order->>'net_sales_cents')::bigint,
      (p_order->>'amount_paid_cents')::bigint, 0, coalesce(p_order->>'notes', ''),
      coalesce(p_order->>'paid_at', ''), coalesce(p_order->>'delivered_at', ''),
      coalesce((p_order->>'created_at')::timestamptz, now()),
      coalesce((p_order->>'updated_at')::timestamptz, now())
    );
  end if;

  delete from public.sales_items where order_id = v_id;
  insert into public.sales_items (
    id, order_id, product_id, product_name, sku, variant, quantity,
    unit_price_cents, unit_cost_cents, line_total_cents
  ) values (
    (p_item->>'id')::uuid, v_id, null, p_item->>'product_name', '', '', 1,
    (p_item->>'unit_price_cents')::bigint, 0, (p_item->>'line_total_cents')::bigint
  );

  return jsonb_build_object('id', v_id, 'action', v_action);
end;
$$;

revoke all on function public.pa_adjust_inventory(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.pa_create_order(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.pa_update_order(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.pa_delete_order(uuid) from public, anon, authenticated;
revoke all on function public.pa_import_enstack_order(jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.pa_adjust_inventory(uuid, integer, text) to service_role;
grant execute on function public.pa_create_order(jsonb, jsonb) to service_role;
grant execute on function public.pa_update_order(uuid, jsonb, jsonb) to service_role;
grant execute on function public.pa_delete_order(uuid) to service_role;
grant execute on function public.pa_import_enstack_order(jsonb, jsonb) to service_role;
