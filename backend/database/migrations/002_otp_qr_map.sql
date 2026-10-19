-- ====================================================================
-- Migration 002: email OTP registration, household QR codes, QR payments,
-- collector scans and map tracking.
-- ====================================================================

-- 1) Email OTP verification for resident self-registration.
-- A registration waits here until the 6-digit code sent to the email address is
-- confirmed. Only then are the household and the (pending) account created.
CREATE TABLE pending_registrations (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(60) NOT NULL,
  email VARCHAR(120) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  contact_number VARCHAR(30) NOT NULL DEFAULT '',
  purok_id VARCHAR(64) NOT NULL,
  address_details VARCHAR(255) NULL,
  family_member_count INT NOT NULL DEFAULT 1,
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  -- SHA-256 of "<id>:<code>"; the code itself is never stored
  code_hash CHAR(64) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  resend_count INT NOT NULL DEFAULT 0,
  last_sent_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pending_reg_purok FOREIGN KEY (purok_id) REFERENCES puroks(id) ON DELETE CASCADE,
  INDEX idx_pending_reg_username (username),
  INDEX idx_pending_reg_email (email),
  INDEX idx_pending_reg_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users
  ADD COLUMN email_verified_at TIMESTAMP NULL AFTER email;

-- 2) Map locations.
ALTER TABLE puroks
  ADD COLUMN latitude DECIMAL(9,6) NULL,
  ADD COLUMN longitude DECIMAL(9,6) NULL;

-- 3) Household QR code (random, unguessable; can be regenerated if a card is lost).
ALTER TABLE households
  ADD COLUMN latitude DECIMAL(9,6) NULL,
  ADD COLUMN longitude DECIMAL(9,6) NULL,
  ADD COLUMN qr_token VARCHAR(64) NULL,
  ADD UNIQUE KEY uq_households_qr (qr_token);

-- 4) Payments: unique payment code per submission, cash collected by a collector
--    (household may have no registered resident), and who recorded it.
ALTER TABLE payment_submissions
  MODIFY resident_id VARCHAR(64) NULL,
  MODIFY payment_method ENUM('Cash to Leader', 'Cash to Collector', 'GCash', 'Maya', 'Barangay Hall') NOT NULL DEFAULT 'GCash',
  ADD COLUMN payment_code VARCHAR(40) NULL AFTER id,
  ADD COLUMN recorded_by VARCHAR(64) NULL,
  ADD COLUMN source ENUM('resident', 'collector_scan', 'leader_scan') NOT NULL DEFAULT 'resident',
  ADD UNIQUE KEY uq_payments_code (payment_code),
  ADD CONSTRAINT fk_payments_recorder FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL;

-- Give older payments a code, and make old duplicate e-wallet references unique before adding the key.
UPDATE payment_submissions
   SET payment_code = CONCAT('BB-PAY-OLD-', UPPER(LEFT(REPLACE(id, 'pay-', ''), 8)))
 WHERE payment_code IS NULL;

UPDATE payment_submissions
   SET reference_number = LEFT(CONCAT(reference_number, '-', RIGHT(id, 6)), 100)
 WHERE id IN (
   SELECT id FROM (
     SELECT p1.id FROM payment_submissions p1
       JOIN payment_submissions p2
         ON p1.payment_method = p2.payment_method AND p1.reference_number = p2.reference_number AND p1.id > p2.id
      WHERE p1.status <> 'Rejected' AND p2.status <> 'Rejected' AND p1.payment_method IN ('GCash', 'Maya')
   ) dup
 );

-- e-wallet reference numbers must not be reused for another live payment
ALTER TABLE payment_submissions
  ADD COLUMN ref_key VARCHAR(140) GENERATED ALWAYS AS (
    IF(status <> 'Rejected' AND payment_method IN ('GCash', 'Maya'), CONCAT(payment_method, '|', reference_number), NULL)
  ) STORED,
  ADD UNIQUE KEY uq_payments_ref (ref_key);

-- 5) Collector / leader QR scans in the field.
CREATE TABLE collection_scans (
  id VARCHAR(64) PRIMARY KEY,
  scan_type ENUM('Disposal', 'Payment') NOT NULL,
  schedule_id VARCHAR(64) NULL,
  household_id VARCHAR(64) NOT NULL,
  purok_id VARCHAR(64) NOT NULL,
  scanned_by VARCHAR(64) NOT NULL,
  bag_count INT NULL,
  payment_id VARCHAR(64) NULL,
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- One disposal pick-up scan per household per collection run.
  disposal_key VARCHAR(140) GENERATED ALWAYS AS (
    IF(scan_type = 'Disposal', CONCAT(schedule_id, '|', household_id), NULL)
  ) STORED,
  CONSTRAINT fk_scans_schedule FOREIGN KEY (schedule_id) REFERENCES collection_schedules(id) ON DELETE RESTRICT,
  CONSTRAINT fk_scans_household FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT,
  CONSTRAINT fk_scans_purok FOREIGN KEY (purok_id) REFERENCES puroks(id) ON DELETE RESTRICT,
  CONSTRAINT fk_scans_user FOREIGN KEY (scanned_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_scans_payment FOREIGN KEY (payment_id) REFERENCES payment_submissions(id) ON DELETE SET NULL,
  CONSTRAINT chk_scans_bags CHECK (bag_count IS NULL OR bag_count BETWEEN 1 AND 50),
  UNIQUE KEY uq_scans_disposal (disposal_key),
  INDEX idx_scans_schedule (schedule_id),
  INDEX idx_scans_household (household_id, created_at),
  INDEX idx_scans_purok_date (purok_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6) Live GPS trail of collectors while a collection is in progress.
CREATE TABLE collector_locations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  collector_id VARCHAR(64) NOT NULL,
  schedule_id VARCHAR(64) NOT NULL,
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  accuracy_m DECIMAL(8,1) NULL,
  recorded_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_locations_collector FOREIGN KEY (collector_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_locations_schedule FOREIGN KEY (schedule_id) REFERENCES collection_schedules(id) ON DELETE CASCADE,
  INDEX idx_locations_schedule (schedule_id, recorded_at),
  INDEX idx_locations_collector (collector_id, recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE notifications
  MODIFY type ENUM('schedule', 'disposal', 'payment', 'endorsement', 'system', 'announcement', 'scan') NOT NULL DEFAULT 'system';

-- Payment QR images (GCash / Maya) are stored as image data URLs.
ALTER TABLE system_settings
  MODIFY setting_value MEDIUMTEXT NOT NULL;
