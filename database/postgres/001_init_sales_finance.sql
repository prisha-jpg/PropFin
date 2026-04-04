BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_code VARCHAR(20) UNIQUE NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  phone VARCHAR(15),
  role VARCHAR(30) NOT NULL CHECK (role IN ('admin','finance','sales_exec','manager','approver','viewer')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

ALTER TABLE users
  ADD CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_code VARCHAR(20) UNIQUE NOT NULL,
  project_name VARCHAR(150) NOT NULL,
  location TEXT,
  city VARCHAR(80),
  state VARCHAR(80),
  total_units INTEGER,
  project_type VARCHAR(50) CHECK (project_type IN ('residential','commercial','mixed')),
  launch_date DATE,
  completion_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  block_code VARCHAR(20) NOT NULL,
  block_name VARCHAR(100) NOT NULL,
  total_units INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  UNIQUE (project_id, block_code)
);

CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  block_id UUID REFERENCES blocks(id) ON DELETE SET NULL,
  unit_number VARCHAR(30) NOT NULL,
  floor_number INTEGER,
  unit_type VARCHAR(50),
  carpet_area NUMERIC(10,2),
  built_up_area NUMERIC(10,2),
  super_built_up_area NUMERIC(10,2),
  facing VARCHAR(30),
  base_price NUMERIC(15,2),
  status VARCHAR(30) NOT NULL DEFAULT 'available' CHECK (status IN ('available','booked','allotted','cancelled','held','resale')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  UNIQUE (project_id, unit_number)
);

CREATE TABLE bank_master (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_name VARCHAR(150) NOT NULL,
  branch_name VARCHAR(150),
  ifsc_code VARCHAR(15),
  account_number VARCHAR(30),
  micr_code VARCHAR(10),
  address TEXT,
  city VARCHAR(80),
  contact_person VARCHAR(100),
  contact_phone VARCHAR(15),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE tds_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_code VARCHAR(30) UNIQUE NOT NULL,
  account_name VARCHAR(150) NOT NULL,
  tds_section VARCHAR(20),
  tds_rate NUMERIC(5,2),
  applicable_from DATE,
  applicable_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE document_checklist_master (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_name VARCHAR(200) NOT NULL,
  stage VARCHAR(50) NOT NULL CHECK (stage IN ('booking','agreement','loan','handover','resale','cancellation')),
  is_mandatory BOOLEAN NOT NULL DEFAULT true,
  applicable_to VARCHAR(50) NOT NULL DEFAULT 'all' CHECK (applicable_to IN ('all','individual','company','nri')),
  display_order INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE project_demand_number_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  prefix VARCHAR(20),
  current_sequence INTEGER NOT NULL DEFAULT 0,
  padding_length INTEGER NOT NULL DEFAULT 5,
  financial_year VARCHAR(10),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  UNIQUE (project_id, financial_year)
);

CREATE TABLE waiver_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  waiver_code VARCHAR(20) UNIQUE NOT NULL,
  waiver_name VARCHAR(150) NOT NULL,
  description TEXT,
  max_waiver_percent NUMERIC(5,2),
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  approval_level VARCHAR(30) CHECK (approval_level IN ('manager','gm','director','board')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_code VARCHAR(30) UNIQUE NOT NULL,
  salutation VARCHAR(10),
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80),
  full_name VARCHAR(200) GENERATED ALWAYS AS (
    btrim(
      COALESCE(salutation, '') || ' ' || first_name || ' ' || COALESCE(last_name, '')
    )
  ) STORED,
  date_of_birth DATE,
  pan_number VARCHAR(10),
  aadhaar_number VARCHAR(12),
  email VARCHAR(150),
  phone_primary VARCHAR(15),
  phone_secondary VARCHAR(15),
  address_line1 TEXT,
  address_line2 TEXT,
  city VARCHAR(80),
  state VARCHAR(80),
  pincode VARCHAR(10),
  customer_type VARCHAR(30) NOT NULL DEFAULT 'individual' CHECK (customer_type IN ('individual','company','nri','joint')),
  nationality VARCHAR(50) NOT NULL DEFAULT 'Indian',
  has_active_loan BOOLEAN NOT NULL DEFAULT false,
  loan_bank_id UUID REFERENCES bank_master(id),
  loan_account_number VARCHAR(50),
  loan_sanctioned_amount NUMERIC(15,2),
  gstin VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_customers_code ON customers(customer_code);
CREATE INDEX idx_customers_pan ON customers(pan_number);
CREATE INDEX idx_customers_name ON customers USING gin(full_name gin_trgm_ops);

CREATE TABLE customer_co_applicants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  applicant_number INTEGER NOT NULL,
  salutation VARCHAR(10),
  full_name VARCHAR(200) NOT NULL,
  pan_number VARCHAR(10),
  relation VARCHAR(50),
  phone VARCHAR(15),
  email VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  UNIQUE (customer_id, applicant_number)
);

CREATE TABLE sales_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(30) UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  block_id UUID REFERENCES blocks(id),
  unit_id UUID NOT NULL REFERENCES units(id),
  sales_executive_id UUID REFERENCES users(id),
  channel VARCHAR(50),
  booking_date DATE NOT NULL,
  agreement_date DATE,
  agreement_value NUMERIC(15,2),
  basic_sale_value NUMERIC(15,2),
  additional_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  other_charges NUMERIC(15,2) NOT NULL DEFAULT 0,
  sgst_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  cgst_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  igst_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_value NUMERIC(15,2) GENERATED ALWAYS AS (
    COALESCE(basic_sale_value,0) + COALESCE(additional_value,0) +
    COALESCE(other_charges,0) + COALESCE(sgst_amount,0) +
    COALESCE(cgst_amount,0) + COALESCE(igst_amount,0)
  ) STORED,
  sale_area NUMERIC(10,2),
  rate_per_sqft NUMERIC(10,2),
  status VARCHAR(30) NOT NULL DEFAULT 'open_order' CHECK (status IN ('open_order','allotted','agreement_done','handover_pending','handed_over','cancelled','resale')),
  release_status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (release_status IN ('open','hold','released')),
  on_hold BOOLEAN NOT NULL DEFAULT false,
  hold_reason TEXT,
  do_not_process BOOLEAN NOT NULL DEFAULT false,
  cancellation_date DATE,
  handover_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_sales_orders_customer ON sales_orders(customer_id);
CREATE INDEX idx_sales_orders_unit ON sales_orders(unit_id);
CREATE INDEX idx_sales_orders_project ON sales_orders(project_id);
CREATE INDEX idx_sales_orders_status ON sales_orders(status);

CREATE TABLE payment_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  milestone_name VARCHAR(150) NOT NULL,
  schedule_type VARCHAR(30) CHECK (schedule_type IN ('booking','construction','possession','custom')),
  percentage_of_total NUMERIC(6,3),
  due_amount NUMERIC(15,2) NOT NULL,
  original_due_date DATE,
  revised_due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','due','partial','paid','overdue','waived')),
  display_order INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE agreement_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sales_order_id UUID NOT NULL UNIQUE REFERENCES sales_orders(id) ON DELETE CASCADE,
  agreement_number VARCHAR(50),
  agreement_date DATE,
  registration_date DATE,
  stamp_duty_amount NUMERIC(15,2),
  registration_fees NUMERIC(15,2),
  notary_charges NUMERIC(15,2),
  agreement_value NUMERIC(15,2),
  sub_registrar_office VARCHAR(150),
  document_number VARCHAR(50),
  agreement_file_path TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE demand_letters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  demand_number VARCHAR(50) UNIQUE NOT NULL,
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  payment_schedule_id UUID REFERENCES payment_schedules(id),
  demand_type VARCHAR(30) CHECK (demand_type IN ('first','subsequent_prl','reminder','final')),
  demand_date DATE NOT NULL,
  due_date DATE,
  principal_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  interest_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  gst_on_interest NUMERIC(15,2) NOT NULL DEFAULT 0,
  other_charges NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_demand_amount NUMERIC(15,2) GENERATED ALWAYS AS (
    COALESCE(principal_amount,0) + COALESCE(interest_amount,0) +
    COALESCE(gst_on_interest,0) + COALESCE(other_charges,0)
  ) STORED,
  status VARCHAR(20) NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','sent','acknowledged','paid','partially_paid','cancelled')),
  sent_via VARCHAR(30) CHECK (sent_via IN ('email','post','whatsapp','hand_delivery','portal')),
  sent_at TIMESTAMPTZ,
  generation_sequence INTEGER NOT NULL DEFAULT 1,
  letter_content JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_demand_letters_order ON demand_letters(sales_order_id);
CREATE INDEX idx_demand_letters_customer ON demand_letters(customer_id);

CREATE TABLE customer_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_number VARCHAR(50) UNIQUE NOT NULL,
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  payment_schedule_id UUID REFERENCES payment_schedules(id),
  receipt_date DATE NOT NULL,
  consideration_date DATE,
  amount NUMERIC(15,2) NOT NULL,
  payment_mode VARCHAR(30) CHECK (payment_mode IN ('neft','rtgs','cheque','dd','cash','upi','bank_transfer','wire')),
  bank_name VARCHAR(150),
  cheque_dd_number VARCHAR(50),
  instrument_date DATE,
  drawee_bank VARCHAR(150),
  transaction_reference VARCHAR(100),
  narration TEXT,
  receipt_type VARCHAR(30) NOT NULL DEFAULT 'payment' CHECK (receipt_type IN ('payment','advance','adjustment','refund','tds')),
  status VARCHAR(20) NOT NULL DEFAULT 'received' CHECK (status IN ('received','cleared','bounced','cancelled','on_hold')),
  cleared_date DATE,
  bounce_reason TEXT,
  tds_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  tds_account_id UUID REFERENCES tds_accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_receipts_order ON customer_receipts(sales_order_id);
CREATE INDEX idx_receipts_customer ON customer_receipts(customer_id);
CREATE INDEX idx_receipts_date ON customer_receipts(receipt_date);
CREATE INDEX idx_receipts_consideration ON customer_receipts(consideration_date);

CREATE TABLE interest_calculation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_date DATE NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  project_id UUID REFERENCES projects(id),
  customer_group VARCHAR(50),
  interest_rate NUMERIC(6,4) NOT NULL,
  calculation_method VARCHAR(30) CHECK (calculation_method IN ('simple','compound','reducing_balance')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','reversed')),
  processed_count INTEGER NOT NULL DEFAULT 0,
  total_interest_generated NUMERIC(15,2) NOT NULL DEFAULT 0,
  run_by UUID REFERENCES users(id),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE interest_entries (
  id UUID DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES interest_calculation_runs(id),
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  overdue_principal NUMERIC(15,2),
  interest_rate NUMERIC(6,4),
  days_overdue INTEGER,
  interest_amount NUMERIC(15,2) NOT NULL,
  gst_on_interest NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_interest NUMERIC(15,2) GENERATED ALWAYS AS (COALESCE(interest_amount,0) + COALESCE(gst_on_interest,0)) STORED,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','waived','settled','reversed')),
  waiver_id UUID,
  settlement_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  PRIMARY KEY (period_from, id)
) PARTITION BY RANGE (period_from);

CREATE TABLE interest_entries_2024 PARTITION OF interest_entries FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE interest_entries_2025 PARTITION OF interest_entries FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE interest_entries_2026 PARTITION OF interest_entries FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE INDEX idx_interest_order ON interest_entries(sales_order_id);
CREATE INDEX idx_interest_customer ON interest_entries(customer_id);

CREATE TABLE interest_waiver_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_number VARCHAR(30) UNIQUE NOT NULL,
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  waiver_type_id UUID NOT NULL REFERENCES waiver_types(id),
  interest_entry_ids UUID[],
  total_interest_amount NUMERIC(15,2),
  waiver_requested_amount NUMERIC(15,2),
  waiver_approved_amount NUMERIC(15,2),
  waiver_percentage NUMERIC(5,2),
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','approved','rejected','partially_approved')),
  requested_by UUID REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  request_date DATE,
  review_date DATE,
  approval_date DATE,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE interest_settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  settlement_number VARCHAR(30) UNIQUE NOT NULL,
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  receipt_id UUID REFERENCES customer_receipts(id),
  waiver_request_id UUID REFERENCES interest_waiver_requests(id),
  settlement_date DATE NOT NULL,
  total_interest_due NUMERIC(15,2),
  amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_waived NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_adjusted NUMERIC(15,2) NOT NULL DEFAULT 0,
  balance_remaining NUMERIC(15,2) GENERATED ALWAYS AS (
    COALESCE(total_interest_due,0) - COALESCE(amount_paid,0) -
    COALESCE(amount_waived,0) - COALESCE(amount_adjusted,0)
  ) STORED,
  settlement_mode VARCHAR(30) CHECK (settlement_mode IN ('payment','waiver','adjustment','combined')),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

ALTER TABLE interest_entries
  ADD CONSTRAINT fk_interest_entries_waiver FOREIGN KEY (waiver_id) REFERENCES interest_waiver_requests(id);

ALTER TABLE interest_entries
  ADD CONSTRAINT fk_interest_entries_settlement FOREIGN KEY (settlement_id) REFERENCES interest_settlements(id);

CREATE TABLE fpv_calculations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  calculation_number VARCHAR(30) UNIQUE NOT NULL,
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  calculation_date DATE NOT NULL,
  horizon_date DATE,
  interest_rate NUMERIC(6,4),
  calculation_type VARCHAR(20) CHECK (calculation_type IN ('fpv','npv','irr','discount')),
  total_agreement_value NUMERIC(15,2),
  discount_on_upfront NUMERIC(15,2) NOT NULL DEFAULT 0,
  interest_on_late_payment NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_fpv NUMERIC(15,2),
  schedule_details JSONB,
  payment_details JSONB,
  computed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE handover_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_number VARCHAR(30) UNIQUE NOT NULL,
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  request_date DATE NOT NULL,
  proposed_handover_date DATE,
  actual_handover_date DATE,
  outstanding_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  pending_documents TEXT[],
  payment_clearance_status BOOLEAN NOT NULL DEFAULT false,
  noc_status BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','documents_pending','under_review','approved','scheduled','completed','rejected')),
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approval_date DATE,
  rejection_reason TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE cancellation_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_number VARCHAR(30) UNIQUE NOT NULL,
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  request_date DATE NOT NULL,
  cancellation_reason VARCHAR(50) CHECK (cancellation_reason IN ('financial','personal','project_delay','quality','other')),
  reason_description TEXT,
  total_amount_paid NUMERIC(15,2),
  cancellation_charges NUMERIC(15,2) NOT NULL DEFAULT 0,
  forfeiture_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  refundable_amount NUMERIC(15,2),
  penalty_percentage NUMERIC(5,2),
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','approved','rejected','completed')),
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approval_date DATE,
  effective_date DATE,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE refund_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_number VARCHAR(30) UNIQUE NOT NULL,
  cancellation_id UUID REFERENCES cancellation_requests(id),
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  request_date DATE NOT NULL,
  refund_amount NUMERIC(15,2) NOT NULL,
  tds_deduction NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_refund_amount NUMERIC(15,2) GENERATED ALWAYS AS (COALESCE(refund_amount,0) - COALESCE(tds_deduction,0)) STORED,
  bank_id UUID REFERENCES bank_master(id),
  account_holder_name VARCHAR(150),
  account_number VARCHAR(30),
  ifsc_code VARCHAR(15),
  payment_mode VARCHAR(30) CHECK (payment_mode IN ('neft','rtgs','cheque','dd')),
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','finance_review','management_approval','bank_processing','disbursed','rejected')),
  requested_by UUID REFERENCES users(id),
  finance_reviewed_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  disbursed_by UUID REFERENCES users(id),
  disbursement_date DATE,
  transaction_reference VARCHAR(100),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE shifting_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_number VARCHAR(30) UNIQUE NOT NULL,
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  from_unit_id UUID NOT NULL REFERENCES units(id),
  to_unit_id UUID NOT NULL REFERENCES units(id),
  from_project_id UUID REFERENCES projects(id),
  to_project_id UUID REFERENCES projects(id),
  request_date DATE NOT NULL,
  reason TEXT,
  price_difference NUMERIC(15,2),
  area_difference NUMERIC(10,2),
  floor_difference INTEGER,
  additional_amount_payable NUMERIC(15,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','approved','rejected','completed')),
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approval_date DATE,
  effective_date DATE,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE resale_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_number VARCHAR(30) UNIQUE NOT NULL,
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
  original_customer_id UUID NOT NULL REFERENCES customers(id),
  new_customer_id UUID REFERENCES customers(id),
  request_date DATE NOT NULL,
  resale_value NUMERIC(15,2),
  transfer_charges NUMERIC(15,2) NOT NULL DEFAULT 0,
  outstanding_dues NUMERIC(15,2) NOT NULL DEFAULT 0,
  noc_required BOOLEAN NOT NULL DEFAULT true,
  noc_issued BOOLEAN NOT NULL DEFAULT false,
  documents_submitted TEXT[],
  new_buyer_details JSONB,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','due_clearance','noc_pending','document_verification','approved','rejected','completed')),
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approval_date DATE,
  completion_date DATE,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE bank_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_number VARCHAR(50) UNIQUE NOT NULL,
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  bank_id UUID REFERENCES bank_master(id),
  document_type VARCHAR(30) NOT NULL CHECK (document_type IN ('bank_noc','builder_noc','loan_noc','tripartite_agreement','undertaking')),
  trigger_source VARCHAR(30) NOT NULL DEFAULT 'manual' CHECK (trigger_source IN ('manual','auto_payment_reminder','auto_handover')),
  triggered_by_reference VARCHAR(50),
  generation_date DATE NOT NULL,
  valid_upto DATE,
  loan_account_number VARCHAR(50),
  loan_amount NUMERIC(15,2),
  bank_officer_name VARCHAR(100),
  bank_officer_designation VARCHAR(100),
  noc_purpose VARCHAR(50) CHECK (noc_purpose IN ('home_loan','mortgage','resale','handover','general')),
  document_content JSONB,
  file_path TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','generated','sent','acknowledged','expired')),
  sent_to VARCHAR(150),
  sent_date DATE,
  acknowledged_date DATE,
  generated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_bank_docs_order ON bank_documents(sales_order_id);
CREATE INDEX idx_bank_docs_customer ON bank_documents(customer_id);
CREATE INDEX idx_bank_docs_trigger ON bank_documents(trigger_source);

CREATE TABLE payment_reminder_letters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  letter_number VARCHAR(50) UNIQUE NOT NULL,
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  generation_date DATE NOT NULL,
  overdue_amount NUMERIC(15,2),
  overdue_since DATE,
  interest_accrued NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_payable NUMERIC(15,2),
  pay_by_date DATE,
  has_active_loan BOOLEAN NOT NULL DEFAULT false,
  builder_noc_auto_generated BOOLEAN NOT NULL DEFAULT false,
  builder_noc_id UUID REFERENCES bank_documents(id),
  letter_content JSONB,
  sent_via VARCHAR(30) CHECK (sent_via IN ('email','post','whatsapp','hand_delivery')),
  sent_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','sent','acknowledged','paid')),
  generated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE client_tds_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tds_certificate_number VARCHAR(50) UNIQUE NOT NULL,
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  tds_account_id UUID NOT NULL REFERENCES tds_accounts(id),
  receipt_id UUID REFERENCES customer_receipts(id),
  financial_year VARCHAR(10) NOT NULL,
  quarter VARCHAR(5) CHECK (quarter IN ('Q1','Q2','Q3','Q4')),
  transaction_date DATE NOT NULL,
  transaction_amount NUMERIC(15,2),
  tds_rate NUMERIC(5,2),
  tds_amount NUMERIC(15,2) NOT NULL,
  pan_of_deductor VARCHAR(10),
  tan_of_deductor VARCHAR(10),
  form_26qb_reference VARCHAR(50),
  acknowledgement_number VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','filed','certificate_issued','rectified')),
  generated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name VARCHAR(80) NOT NULL,
  record_id UUID NOT NULL,
  action VARCHAR(10) NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_audit_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_changed_at ON audit_log(changed_at DESC);

CREATE MATERIALIZED VIEW crm_ledger AS
WITH receipt_entries AS (
  SELECT
    so.id AS sales_order_id,
    so.order_number,
    c.customer_code,
    c.full_name AS customer_name,
    c.pan_number,
    p.project_name,
    u.unit_number,
    so.basic_sale_value,
    so.total_value,
    'Receipt'::TEXT AS entry_type,
    cr.receipt_date AS entry_date,
    MAX(cr.consideration_date) AS consideration_date,
    string_agg(COALESCE(cr.narration, 'Receipt'), '; ' ORDER BY cr.receipt_number) AS narration,
    0::NUMERIC(15,2) AS debit_amount,
    SUM(cr.amount)::NUMERIC(15,2) AS credit_amount
  FROM sales_orders so
  JOIN customers c ON so.customer_id = c.id
  JOIN projects p ON so.project_id = p.id
  JOIN units u ON so.unit_id = u.id
  JOIN customer_receipts cr ON cr.sales_order_id = so.id
  WHERE cr.status NOT IN ('cancelled','bounced')
  GROUP BY so.id, so.order_number, c.customer_code, c.full_name, c.pan_number, p.project_name, u.unit_number, so.basic_sale_value, so.total_value, cr.receipt_date
),
instalment_entries AS (
  SELECT
    so.id AS sales_order_id,
    so.order_number,
    c.customer_code,
    c.full_name AS customer_name,
    c.pan_number,
    p.project_name,
    u.unit_number,
    so.basic_sale_value,
    so.total_value,
    'Instalment'::TEXT AS entry_type,
    ps.original_due_date AS entry_date,
    MAX(ps.revised_due_date) AS consideration_date,
    string_agg(ps.milestone_name, '; ' ORDER BY ps.display_order NULLS LAST, ps.id) AS narration,
    SUM(ps.due_amount)::NUMERIC(15,2) AS debit_amount,
    0::NUMERIC(15,2) AS credit_amount
  FROM sales_orders so
  JOIN customers c ON so.customer_id = c.id
  JOIN projects p ON so.project_id = p.id
  JOIN units u ON so.unit_id = u.id
  JOIN payment_schedules ps ON ps.sales_order_id = so.id
  GROUP BY so.id, so.order_number, c.customer_code, c.full_name, c.pan_number, p.project_name, u.unit_number, so.basic_sale_value, so.total_value, ps.original_due_date
),
unioned AS (
  SELECT * FROM receipt_entries
  UNION ALL
  SELECT * FROM instalment_entries
)
SELECT
  u.sales_order_id,
  u.order_number,
  u.customer_code,
  u.customer_name,
  u.pan_number,
  u.project_name,
  u.unit_number,
  u.basic_sale_value,
  u.total_value,
  u.entry_type,
  u.entry_date,
  u.consideration_date,
  u.narration,
  u.debit_amount,
  u.credit_amount,
  (
    COALESCE(u.total_value, 0)
    + SUM(u.debit_amount - u.credit_amount) OVER (
      PARTITION BY u.sales_order_id
      ORDER BY u.entry_date, u.entry_type
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )
  )::NUMERIC(15,2) AS net_balance
FROM unioned u;

CREATE UNIQUE INDEX idx_crm_ledger_unique ON crm_ledger(sales_order_id, entry_type, entry_date);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
  v_changed_by UUID;
BEGIN
  v_changed_by := NULLIF(current_setting('app.user_id', true), '')::UUID;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log(table_name, record_id, action, changed_by, new_values, created_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_changed_by, row_to_json(NEW)::jsonb, v_changed_by);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log(table_name, record_id, action, changed_by, old_values, new_values, created_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_changed_by, row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb, v_changed_by);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log(table_name, record_id, action, changed_by, old_values, created_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', v_changed_by, row_to_json(OLD)::jsonb, v_changed_by);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION auto_generate_builder_noc()
RETURNS TRIGGER AS $$
DECLARE
  v_loan BOOLEAN;
  v_noc_id UUID;
  v_document_number TEXT;
BEGIN
  SELECT has_active_loan INTO v_loan
  FROM customers
  WHERE id = NEW.customer_id;

  IF COALESCE(v_loan, false) THEN
    v_document_number := 'BNOC-' || to_char(NOW(),'YYYYMMDD') || '-' || substr(NEW.id::TEXT, 1, 8);

    INSERT INTO bank_documents (
      document_number,
      sales_order_id,
      customer_id,
      document_type,
      trigger_source,
      triggered_by_reference,
      generation_date,
      status,
      generated_by,
      created_by
    ) VALUES (
      v_document_number,
      NEW.sales_order_id,
      NEW.customer_id,
      'builder_noc',
      'auto_payment_reminder',
      NEW.letter_number,
      CURRENT_DATE,
      'generated',
      NEW.generated_by,
      NEW.created_by
    ) RETURNING id INTO v_noc_id;

    UPDATE payment_reminder_letters
    SET builder_noc_auto_generated = true,
        has_active_loan = true,
        builder_noc_id = v_noc_id,
        updated_at = NOW()
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_unit_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled' THEN
    UPDATE units SET status = 'available', updated_at = NOW() WHERE id = NEW.unit_id;
  ELSIF NEW.status IN ('allotted', 'handed_over') THEN
    UPDATE units SET status = 'allotted', updated_at = NOW() WHERE id = NEW.unit_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','projects','blocks','units','bank_master','tds_accounts','document_checklist_master',
    'project_demand_number_config','waiver_types','customers','customer_co_applicants','sales_orders',
    'payment_schedules','agreement_details','demand_letters','customer_receipts','interest_calculation_runs',
    'interest_entries','interest_waiver_requests','interest_settlements','fpv_calculations','handover_requests',
    'cancellation_requests','refund_requests','shifting_requests','resale_requests','bank_documents',
    'payment_reminder_letters','client_tds_records','audit_log'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS audit_sales_orders ON sales_orders;
CREATE TRIGGER audit_sales_orders
AFTER INSERT OR UPDATE OR DELETE ON sales_orders
FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_customer_receipts ON customer_receipts;
CREATE TRIGGER audit_customer_receipts
AFTER INSERT OR UPDATE OR DELETE ON customer_receipts
FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_cancellation_requests ON cancellation_requests;
CREATE TRIGGER audit_cancellation_requests
AFTER INSERT OR UPDATE OR DELETE ON cancellation_requests
FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS audit_payment_reminder_letters ON payment_reminder_letters;
CREATE TRIGGER audit_payment_reminder_letters
AFTER INSERT OR UPDATE OR DELETE ON payment_reminder_letters
FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

DROP TRIGGER IF EXISTS trg_auto_builder_noc ON payment_reminder_letters;
CREATE TRIGGER trg_auto_builder_noc
AFTER INSERT ON payment_reminder_letters
FOR EACH ROW EXECUTE FUNCTION auto_generate_builder_noc();

DROP TRIGGER IF EXISTS trg_sync_unit ON sales_orders;
CREATE TRIGGER trg_sync_unit
AFTER UPDATE ON sales_orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION sync_unit_status();

WITH admin_user AS (
  INSERT INTO users (employee_code, full_name, email, role, is_active)
  VALUES ('EMP-0001', 'System Administrator', 'admin@propfin.local', 'admin', true)
  ON CONFLICT (employee_code) DO UPDATE SET updated_at = NOW()
  RETURNING id
),
selected_admin AS (
  SELECT id FROM admin_user
  UNION ALL
  SELECT id FROM users WHERE employee_code = 'EMP-0001' LIMIT 1
),
seed_projects AS (
  INSERT INTO projects (project_code, project_name, city, state, project_type, is_active, created_by)
  SELECT 'PRJ-001', 'PropFin Residency', 'Pune', 'Maharashtra', 'residential', true, id FROM selected_admin
  ON CONFLICT (project_code) DO UPDATE SET updated_at = NOW()
  RETURNING id
),
selected_project AS (
  SELECT id FROM seed_projects
  UNION ALL
  SELECT id FROM projects WHERE project_code = 'PRJ-001' LIMIT 1
),
seed_block AS (
  INSERT INTO blocks (project_id, block_code, block_name, total_units, is_active, created_by)
  SELECT id, 'A', 'Tower A', 120, true, (SELECT id FROM selected_admin) FROM selected_project
  ON CONFLICT (project_id, block_code) DO UPDATE SET updated_at = NOW()
  RETURNING id, project_id
),
selected_block AS (
  SELECT id, project_id FROM seed_block
  UNION ALL
  SELECT id, project_id FROM blocks WHERE block_code = 'A' AND project_id = (SELECT id FROM selected_project LIMIT 1) LIMIT 1
),
seed_unit AS (
  INSERT INTO units (project_id, block_id, unit_number, floor_number, unit_type, carpet_area, base_price, status, created_by)
  SELECT project_id, id, 'A-101', 1, '2BHK', 725.00, 7500000.00, 'available', (SELECT id FROM selected_admin) FROM selected_block
  ON CONFLICT (project_id, unit_number) DO UPDATE SET updated_at = NOW()
  RETURNING id
),
seed_banks AS (
  INSERT INTO bank_master (bank_name, branch_name, ifsc_code, city, is_active, created_by)
  SELECT * FROM (
    VALUES
      ('HDFC Bank', 'Camp Branch', 'HDFC0001234', 'Pune', true),
      ('ICICI Bank', 'Shivaji Nagar', 'ICIC0000456', 'Pune', true),
      ('SBI', 'Main Branch', 'SBIN0000001', 'Mumbai', true)
  ) AS v(bank_name, branch_name, ifsc_code, city, is_active)
  CROSS JOIN selected_admin a
  ON CONFLICT DO NOTHING
  RETURNING id
),
seed_tds AS (
  INSERT INTO tds_accounts (account_code, account_name, tds_section, tds_rate, is_active, created_by)
  SELECT * FROM (
    VALUES
      ('TDS-194IA', 'TDS on immovable property purchase', '194IA', 1.00, true),
      ('TDS-194IB', 'TDS on rent', '194IB', 5.00, true)
  ) AS v(account_code, account_name, tds_section, tds_rate, is_active)
  CROSS JOIN selected_admin a
  ON CONFLICT (account_code) DO UPDATE SET updated_at = NOW()
  RETURNING id
),
seed_docs AS (
  INSERT INTO document_checklist_master (document_name, stage, is_mandatory, display_order, is_active, created_by)
  SELECT * FROM (
    VALUES
      ('PAN Card copy', 'booking', true, 1, true),
      ('Aadhaar Card copy', 'booking', true, 2, true),
      ('Passport size photograph', 'booking', true, 3, true),
      ('Address proof', 'booking', true, 4, true),
      ('Booking amount cheque', 'booking', true, 5, true),
      ('Agreement for sale', 'agreement', true, 1, true),
      ('Stamp duty receipt', 'agreement', true, 2, true),
      ('Registration receipt', 'agreement', true, 3, true),
      ('Bank sanction letter', 'loan', false, 1, true),
      ('Loan agreement copy', 'loan', false, 2, true),
      ('NOC from society', 'handover', true, 1, true),
      ('Completion certificate', 'handover', true, 2, true),
      ('No dues certificate', 'handover', true, 3, true)
  ) AS v(document_name, stage, is_mandatory, display_order, is_active)
  CROSS JOIN selected_admin a
  ON CONFLICT DO NOTHING
  RETURNING id
),
seed_waiver_types AS (
  INSERT INTO waiver_types (waiver_code, waiver_name, max_waiver_percent, approval_level, is_active, created_by)
  SELECT * FROM (
    VALUES
      ('WVR-001', 'Hardship waiver', 100.00, 'director', true),
      ('WVR-002', 'Loyalty waiver', 50.00, 'manager', true),
      ('WVR-003', 'Covid waiver', 100.00, 'board', true),
      ('WVR-004', 'Bulk payment waiver', 25.00, 'manager', true),
      ('WVR-005', 'First-time buyer waiver', 30.00, 'gm', true)
  ) AS v(waiver_code, waiver_name, max_waiver_percent, approval_level, is_active)
  CROSS JOIN selected_admin a
  ON CONFLICT (waiver_code) DO UPDATE SET updated_at = NOW()
  RETURNING id
)
INSERT INTO project_demand_number_config (
  project_id,
  prefix,
  current_sequence,
  padding_length,
  financial_year,
  is_active,
  created_by
)
SELECT
  sp.id,
  'DL-' || to_char(CURRENT_DATE, 'YY') || '-',
  0,
  5,
  to_char(CURRENT_DATE, 'YYYY') || '-' || to_char(CURRENT_DATE + interval '1 year', 'YY'),
  true,
  sa.id
FROM selected_project sp
CROSS JOIN selected_admin sa
ON CONFLICT (project_id, financial_year) DO UPDATE SET updated_at = NOW();

COMMIT;
