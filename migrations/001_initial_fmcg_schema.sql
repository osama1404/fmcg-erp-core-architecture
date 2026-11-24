-- ==============================================================================
-- FMCG Multi-Tenant Core Schema Migration (001_initial_fmcg_schema.sql)
-- Architecture: Multi-tenant, double-entry inventory ledger, FEFO batch tracking,
--               driver van-sales custody reconciliation, and automated credit locks.
-- Target RDBMS: PostgreSQL 14+ / Supabase
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. Tenants (Enterprise Tenancy Isolation)
-- -----------------------------------------------------------------------------
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(32) NOT NULL UNIQUE,
    legal_name VARCHAR(255) NOT NULL,
    tax_registration_number VARCHAR(64) NOT NULL, -- UAE TRN or ZATCA Tax ID
    currency VARCHAR(3) NOT NULL DEFAULT 'AED',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 2. Warehouses & Depots
-- -----------------------------------------------------------------------------
CREATE TABLE warehouses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(128) NOT NULL,
    is_bonded BOOLEAN NOT NULL DEFAULT FALSE,
    is_mobile_van BOOLEAN NOT NULL DEFAULT FALSE, -- Identifies mobile van stock locations
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_warehouses_tenant ON warehouses(tenant_id);

-- -----------------------------------------------------------------------------
-- 3. Products Master Catalog
-- -----------------------------------------------------------------------------
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sku VARCHAR(64) NOT NULL,
    barcode VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL,
    base_uom VARCHAR(16) NOT NULL DEFAULT 'UNIT', -- Unit of Measure (PCS, BOX, CARTON)
    shelf_life_days INT NOT NULL DEFAULT 30,
    unit_cost_price NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    standard_selling_price NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    tax_rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 5.00, -- UAE 5% VAT standard
    is_perishable BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, sku)
);

CREATE INDEX idx_products_tenant_sku ON products(tenant_id, sku);

-- -----------------------------------------------------------------------------
-- 4. Product Batches (FEFO Tracking Matrix)
-- -----------------------------------------------------------------------------
CREATE TABLE product_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    batch_number VARCHAR(64) NOT NULL,
    manufacturing_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    quantity_on_hand INT NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    quantity_allocated INT NOT NULL DEFAULT 0 CHECK (quantity_allocated >= 0),
    is_quarantined BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, warehouse_id, product_id, batch_number)
);

-- Index specifically engineered for lightning-fast FEFO queries
CREATE INDEX idx_batches_fefo_lookup ON product_batches(tenant_id, warehouse_id, product_id, expiry_date ASC)
    WHERE quantity_on_hand > quantity_allocated AND is_quarantined = FALSE;

-- -----------------------------------------------------------------------------
-- 5. Immutable Inventory Ledger (Double-Entry Stock Audit Trail)
-- -----------------------------------------------------------------------------
CREATE TABLE inventory_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES product_batches(id),
    warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    transaction_type VARCHAR(32) NOT NULL, -- 'GRN_RECEIVE', 'FEFO_DISPATCH', 'VAN_LOAD', 'VAN_RETURN', 'DAMAGE_WRITE_OFF'
    quantity_delta INT NOT NULL, -- Positive for intake, negative for dispatch
    reference_document_type VARCHAR(32) NOT NULL, -- 'PURCHASE_RECEIPT', 'SALES_INVOICE', 'CUSTODY_TRANSFER'
    reference_document_id UUID NOT NULL,
    unit_cost NUMERIC(14, 4) NOT NULL,
    performed_by UUID NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ledger_batch_audit ON inventory_ledger(batch_id, created_at);

-- -----------------------------------------------------------------------------
-- 6. Customers Master (Credit Terms & Risk Limits)
-- -----------------------------------------------------------------------------
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(32) NOT NULL,
    legal_name VARCHAR(255) NOT NULL,
    trade_license_number VARCHAR(64),
    tax_id VARCHAR(64), -- Buyer TRN for B2B e-invoicing
    credit_limit NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    current_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    credit_terms_days INT NOT NULL DEFAULT 30,
    credit_locked BOOLEAN NOT NULL DEFAULT FALSE,
    credit_lock_reason VARCHAR(255),
    credit_lock_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_customers_tenant_risk ON customers(tenant_id, credit_locked, current_balance);

-- -----------------------------------------------------------------------------
-- 7. Driver Van-Sales Custody Sessions (Atomic Shift Settlement)
-- -----------------------------------------------------------------------------
CREATE TABLE driver_custody_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL,
    van_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
    shift_start_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    shift_end_time TIMESTAMPTZ,
    status VARCHAR(24) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'PENDING_RECONCILIATION', 'RECONCILED', 'DISCREPANCY_FLAGGED'
    initial_cash_float NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cash_collected NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cash_deposited NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cash_variance NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- (cash_deposited - cash_collected - initial_cash_float)
    stock_variance_count INT NOT NULL DEFAULT 0,
    reconciled_by UUID,
    settlement_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 8. Bounced Check Event Table & Auto-Lock Trigger
-- -----------------------------------------------------------------------------
CREATE TABLE bounced_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    check_number VARCHAR(64) NOT NULL,
    bank_name VARCHAR(128) NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    due_date DATE NOT NULL,
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    return_reason_code VARCHAR(32) NOT NULL, -- 'INSUFFICIENT_FUNDS', 'SIGNATURE_MISMATCH', 'ACCOUNT_CLOSED'
    handled_by UUID NOT NULL,
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Automated Risk Control Trigger Function: Instantly freeze customer credit upon check return
CREATE OR REPLACE FUNCTION fn_freeze_customer_credit_on_bounced_check()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE customers
    SET credit_locked = TRUE,
        credit_lock_reason = FORMAT('Bounced Check #%s: %s (Amount: %s)', NEW.check_number, NEW.return_reason_code, NEW.amount),
        credit_lock_timestamp = CURRENT_TIMESTAMP
    WHERE id = NEW.customer_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bounced_check_credit_lock
AFTER INSERT ON bounced_checks
FOR EACH ROW
EXECUTE FUNCTION fn_freeze_customer_credit_on_bounced_check();

-- -----------------------------------------------------------------------------
-- 9. Sales Orders & Line Allocations
-- -----------------------------------------------------------------------------
CREATE TABLE sales_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_number VARCHAR(32) NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id),
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'FEFO_ALLOCATED', 'DISPATCHED', 'SETTLED', 'CANCELLED'
    total_taxable_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    grand_total NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(24) NOT NULL DEFAULT 'CREDIT', -- 'CASH', 'CREDIT', 'POST_DATED_CHECK'
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, order_number)
);

CREATE TABLE sales_order_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    allocated_batch_id UUID REFERENCES product_batches(id),
    quantity_requested INT NOT NULL,
    quantity_fulfilled INT NOT NULL DEFAULT 0,
    unit_price NUMERIC(14, 4) NOT NULL,
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    line_total NUMERIC(14, 2) NOT NULL
);

-- Row-Level Security Enablement
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_custody_sessions ENABLE ROW LEVEL SECURITY;
