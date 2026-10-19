-- ====================================================================
-- SMART GARBAGE MONITORING SYSTEM - Barangay Bang-Bang, Cordova, Cebu
-- Migration 001: initial schema (MySQL 8.0+)
-- ====================================================================

CREATE TABLE puroks (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  target_collection_days VARCHAR(100) NOT NULL DEFAULT 'Tuesday, Friday',
  leader_id VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE households (
  id VARCHAR(64) PRIMARY KEY,
  household_number VARCHAR(50) NOT NULL UNIQUE,
  purok_id VARCHAR(64) NOT NULL,
  head_name VARCHAR(150) NOT NULL,
  contact_number VARCHAR(30) NOT NULL DEFAULT '',
  address_details VARCHAR(255) NOT NULL,
  family_member_count INT NOT NULL DEFAULT 1,
  waste_segregation_compliant TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_households_purok FOREIGN KEY (purok_id) REFERENCES puroks(id) ON DELETE RESTRICT,
  CONSTRAINT chk_households_members CHECK (family_member_count BETWEEN 1 AND 50),
  INDEX idx_households_purok (purok_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(60) NOT NULL UNIQUE,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  role ENUM('admin', 'collector', 'leader', 'resident') NOT NULL,
  purok_id VARCHAR(64) NULL,
  household_id VARCHAR(64) NULL,
  contact_number VARCHAR(30) NOT NULL DEFAULT '',
  -- 'pending' = self-registered resident waiting for the Purok Leader's approval
  status ENUM('active', 'inactive', 'pending') NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_purok FOREIGN KEY (purok_id) REFERENCES puroks(id) ON DELETE RESTRICT,
  CONSTRAINT fk_users_household FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT,
  INDEX idx_users_role_purok (role, purok_id),
  INDEX idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE puroks
  ADD CONSTRAINT fk_puroks_leader FOREIGN KEY (leader_id) REFERENCES users(id) ON DELETE SET NULL;

-- Login sessions: only the SHA-256 hash of the bearer token is stored.
CREATE TABLE user_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  expires_at DATETIME NOT NULL,
  last_seen_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time password reset codes (hashed, short-lived, attempt-limited).
CREATE TABLE password_reset_codes (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_reset_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE collection_schedules (
  id VARCHAR(64) PRIMARY KEY,
  purok_id VARCHAR(64) NOT NULL,
  collector_id VARCHAR(64) NOT NULL,
  scheduled_date DATE NOT NULL,
  time_slot VARCHAR(60) NOT NULL,
  waste_type ENUM('Biodegradable', 'Non-Biodegradable', 'Recyclable', 'Special Waste') NOT NULL DEFAULT 'Biodegradable',
  status ENUM('Scheduled', 'In Progress', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Scheduled',
  notes TEXT,
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Prevent two live schedules for the same purok, date and time slot.
  active_key VARCHAR(200) GENERATED ALWAYS AS (
    IF(status <> 'Cancelled', CONCAT(purok_id, '|', scheduled_date, '|', time_slot), NULL)
  ) STORED,
  CONSTRAINT fk_schedules_purok FOREIGN KEY (purok_id) REFERENCES puroks(id) ON DELETE RESTRICT,
  CONSTRAINT fk_schedules_collector FOREIGN KEY (collector_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_schedules_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_schedules_active (active_key),
  INDEX idx_schedules_purok_date (purok_id, scheduled_date),
  INDEX idx_schedules_collector (collector_id, scheduled_date),
  INDEX idx_schedules_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE collection_records (
  id VARCHAR(64) PRIMARY KEY,
  schedule_id VARCHAR(64) NOT NULL UNIQUE,
  collector_id VARCHAR(64) NOT NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  status ENUM('In Progress', 'Completed') NOT NULL,
  truck_number VARCHAR(50) NOT NULL DEFAULT 'LGU-BangBang-01',
  collected_volume_kg DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  collector_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_records_schedule FOREIGN KEY (schedule_id) REFERENCES collection_schedules(id) ON DELETE RESTRICT,
  CONSTRAINT fk_records_collector FOREIGN KEY (collector_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_records_volume CHECK (collected_volume_kg >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Resident disposal participation. The Purok Leader's verification lives on the same row.
CREATE TABLE disposal_submissions (
  id VARCHAR(64) PRIMARY KEY,
  schedule_id VARCHAR(64) NOT NULL,
  resident_id VARCHAR(64) NOT NULL,
  household_id VARCHAR(64) NOT NULL,
  purok_id VARCHAR(64) NOT NULL,
  waste_type VARCHAR(50) NOT NULL,
  bag_count INT NOT NULL DEFAULT 1,
  notes TEXT,
  proof_url MEDIUMTEXT,
  submission_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verification_status ENUM('Pending', 'Verified', 'Rejected') NOT NULL DEFAULT 'Pending',
  verified_by VARCHAR(64) NULL,
  verification_remarks TEXT,
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- One live submission per household per collection (a rejected one may be re-submitted).
  active_key VARCHAR(140) GENERATED ALWAYS AS (
    IF(verification_status <> 'Rejected', CONCAT(household_id, '|', schedule_id), NULL)
  ) STORED,
  CONSTRAINT fk_disposal_schedule FOREIGN KEY (schedule_id) REFERENCES collection_schedules(id) ON DELETE RESTRICT,
  CONSTRAINT fk_disposal_resident FOREIGN KEY (resident_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_disposal_household FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT,
  CONSTRAINT fk_disposal_purok FOREIGN KEY (purok_id) REFERENCES puroks(id) ON DELETE RESTRICT,
  CONSTRAINT fk_disposal_verifier FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_disposal_bags CHECK (bag_count BETWEEN 1 AND 50),
  UNIQUE KEY uq_disposal_active (active_key),
  INDEX idx_disposal_purok_status (purok_id, verification_status),
  INDEX idx_disposal_resident (resident_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Weekly contributions. Never auto-verified: only the Purok Leader can verify.
CREATE TABLE payment_submissions (
  id VARCHAR(64) PRIMARY KEY,
  resident_id VARCHAR(64) NOT NULL,
  household_id VARCHAR(64) NOT NULL,
  purok_id VARCHAR(64) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method ENUM('Cash to Leader', 'GCash', 'Maya', 'Barangay Hall') NOT NULL DEFAULT 'GCash',
  reference_number VARCHAR(100) NOT NULL,
  proof_url MEDIUMTEXT,
  status ENUM('Pending', 'Verified', 'Rejected') NOT NULL DEFAULT 'Pending',
  reviewed_by_leader_id VARCHAR(64) NULL,
  reviewed_at TIMESTAMP NULL,
  rejection_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- One live payment per household per week.
  active_key VARCHAR(100) GENERATED ALWAYS AS (
    IF(status <> 'Rejected', CONCAT(household_id, '|', period_start), NULL)
  ) STORED,
  CONSTRAINT fk_payments_resident FOREIGN KEY (resident_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_household FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_purok FOREIGN KEY (purok_id) REFERENCES puroks(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_reviewer FOREIGN KEY (reviewed_by_leader_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_payments_amount CHECK (amount > 0),
  CONSTRAINT chk_payments_period CHECK (period_end >= period_start),
  UNIQUE KEY uq_payments_active (active_key),
  INDEX idx_payments_resident (resident_id),
  INDEX idx_payments_purok_status (purok_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Endorsements: the Purok Leader is the FINAL approver (no admin approval stage).
CREATE TABLE endorsement_requests (
  id VARCHAR(64) PRIMARY KEY,
  resident_id VARCHAR(64) NOT NULL,
  purok_id VARCHAR(64) NOT NULL,
  leader_id VARCHAR(64) NULL,
  purpose VARCHAR(150) NOT NULL,
  details TEXT,
  status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
  remarks TEXT,
  certificate_code VARCHAR(50) NULL UNIQUE,
  issued_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_endorsements_resident FOREIGN KEY (resident_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_endorsements_purok FOREIGN KEY (purok_id) REFERENCES puroks(id) ON DELETE RESTRICT,
  CONSTRAINT fk_endorsements_leader FOREIGN KEY (leader_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_endorsements_purok (purok_id, status),
  INDEX idx_endorsements_resident (resident_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('schedule', 'disposal', 'payment', 'endorsement', 'system', 'announcement') NOT NULL DEFAULT 'system',
  link VARCHAR(255) NOT NULL DEFAULT '',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notifications_user (user_id, is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE announcements (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  category ENUM('Schedule Update', 'Community Advisory', 'Policy Advisory', 'Collection Alert') NOT NULL DEFAULT 'Community Advisory',
  priority ENUM('Normal', 'Important', 'Urgent') NOT NULL DEFAULT 'Normal',
  created_by VARCHAR(64) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_announcements_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_announcements_active (is_active, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE activity_logs (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NULL,
  action VARCHAR(100) NOT NULL,
  module VARCHAR(50) NOT NULL,
  details TEXT,
  ip_address VARCHAR(64) NOT NULL DEFAULT '',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_activity_created (created_at),
  INDEX idx_activity_module (module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE system_settings (
  id VARCHAR(64) PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
