-- Ara Sales — reference schema (MySQL).
-- This mirrors the Knex migration in backend/src/db/migrations. The authoritative
-- source is the migration; this file is a human-readable reference / manual setup.

CREATE DATABASE IF NOT EXISTS ara_sales CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ara_sales;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(20),
  role ENUM('admin','rep') NOT NULL DEFAULT 'rep',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE targets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rep_id INT NOT NULL,
  month CHAR(7) NOT NULL,                  -- YYYY-MM
  client_target INT NOT NULL DEFAULT 0,
  revenue_target DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_target (rep_id, month),
  FOREIGN KEY (rep_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE salaries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rep_id INT NOT NULL,
  month CHAR(7) NOT NULL,
  monthly_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_salary (rep_id, month),
  FOREIGN KEY (rep_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  reference_lat DECIMAL(10,7) NULL,
  reference_lng DECIMAL(10,7) NULL,
  created_by_rep_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_rep_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE sales_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rep_id INT NOT NULL,
  client_id INT NULL,
  client_name VARCHAR(190) NOT NULL,
  product ENUM('schoolmate','school_dm','general_dm','both') NOT NULL,
  lead_type ENUM('hot','warm','cold') NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  sale_date DATE NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sales_rep_date (rep_id, sale_date),
  FOREIGN KEY (rep_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

-- Groups location pings into one "Start Work -> End Work" trip.
CREATE TABLE work_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rep_id INT NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  INDEX idx_ws_rep (rep_id, started_at),
  FOREIGN KEY (rep_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE location_pings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  rep_id INT NOT NULL,
  lat DECIMAL(10,7) NOT NULL,
  lng DECIMAL(10,7) NOT NULL,
  recorded_at DATETIME NOT NULL,
  INDEX idx_ping_rep_time (rep_id, recorded_at),
  FOREIGN KEY (session_id) REFERENCES work_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (rep_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE visits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rep_id INT NOT NULL,
  client_id INT NOT NULL,
  visit_code VARCHAR(12) NOT NULL,
  code_issued_at DATETIME NOT NULL,
  code_expires_at DATETIME NOT NULL,
  code_used BOOLEAN NOT NULL DEFAULT FALSE,
  capture_lat DECIMAL(10,7) NULL,
  capture_lng DECIMAL(10,7) NULL,
  server_timestamp DATETIME NULL,
  geofence_pass BOOLEAN NULL,
  mock_location_flag BOOLEAN NULL,
  status ENUM('pass','flag','reject') NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_visit_rep (rep_id, created_at),
  FOREIGN KEY (rep_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE visit_photos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  visit_id INT NOT NULL,
  file_path VARCHAR(512) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE
);

CREATE TABLE incentives (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rep_id INT NOT NULL,
  month CHAR(7) NOT NULL,
  revenue_target DECIMAL(12,2) NOT NULL DEFAULT 0,
  achieved_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  surplus_pct DECIMAL(6,2) NOT NULL DEFAULT 0,
  monthly_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
  incentive_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_incentive (rep_id, month),
  FOREIGN KEY (rep_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE export_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  export_type VARCHAR(60) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);
