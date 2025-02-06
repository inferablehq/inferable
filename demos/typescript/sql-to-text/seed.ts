import Database from "better-sqlite3";

// Create an in-memory database
const db = new Database(":memory:");

// Create tables
db.exec(`
  CREATE TABLE organizations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT
  );

  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    permission_level TEXT NOT NULL,
    organization_id INTEGER,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
  );
`);

// Seed data
db.exec(`
  -- Famous TV show organizations
  INSERT INTO organizations (id, name, description) VALUES 
  (1, 'Los Pollos Hermanos', 'Family friendly chicken restaurant chain with excellent distribution network'),
  (2, 'Dunder Mifflin', 'Mid-sized paper company serving the proud people of Scranton'),
  (3, 'Acme Corporation', 'Innovative manufacturer of anvils, rocket skates, and portable holes');

  -- Los Pollos Hermanos staff
  INSERT INTO users (id, name, email, permission_level, organization_id) VALUES
  (1, 'Gustavo Fring', 'gus@polloshermanos.com', 'ceo', 1),
  (2, 'Lyle', 'lyle@polloshermanos.com', 'manager', 1),
  (3, 'Cynthia', 'cynthia@polloshermanos.com', 'shift_supervisor', 1);

  -- Dunder Mifflin employees
  INSERT INTO users (id, name, email, permission_level, organization_id) VALUES
  (4, 'Michael Scott', 'michael.scott@dundermifflin.com', 'regional_manager', 2),
  (5, 'Dwight Schrute', 'dwight.schrute@dundermifflin.com', 'assistant_to_regional_manager', 2),
  (6, 'Jim Halpert', 'jim.halpert@dundermifflin.com', 'sales', 2),
  (7, 'Pam Beesly', 'pam.beesly@dundermifflin.com', 'receptionist', 2),
  (8, 'Creed Bratton', 'creed.bratton@dundermifflin.com', 'quality_assurance', 2);

  -- Acme Corp employees
  INSERT INTO users (id, name, email, permission_level, organization_id) VALUES
  (9, 'Wile E Coyote', 'wile.e.coyote@acme.com', 'chief_product_tester', 3),
  (10, 'Road Runner', 'meep.meep@acme.com', 'delivery_specialist', 3),
  (11, 'Bugs Bunny', 'whats.up.doc@acme.com', 'consultant', 3);
`);

// Export the database instance
export default db;
