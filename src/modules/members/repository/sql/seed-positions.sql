-- ============================================================================
-- Seed: positions
-- ----------------------------------------------------------------------------
-- Idempotent (ON CONFLICT DO NOTHING). Insert order respects the self-FK on
-- parent_position_code: parents always come before children.
--
-- name_th  : official labels from the YEC Lamphun position list.
-- name_en  : English translations (please verify wording against your bylaws).
-- ============================================================================

BEGIN;

-- --- Top of tree ----------------------------------------------------------
INSERT INTO positions (code, name_th, name_en, cardinality, parent_position_code, display_order)
VALUES
    ('PRESIDENT', 'ประธาน YEC Lamphun', 'President', 'SINGLE', NULL, 200)
ON CONFLICT (code) DO NOTHING;

-- --- Direct reports to President ------------------------------------------
INSERT INTO positions (code, name_th, name_en, cardinality, parent_position_code, display_order)
VALUES
    ('ADVISORY_BOARD',    'กรรมการที่ปรึกษา',                          'Advisory Board',                'MULTIPLE', 'PRESIDENT', 250),
    ('SECRETARY',         'เลขาธิการ',                                  'Secretary',                     'SINGLE',   'PRESIDENT', 300),
    ('TREASURER',         'เหรัญญิก',                                    'Treasurer',                     'SINGLE',   'PRESIDENT', 320),
    ('LEGAL_COORDINATOR', 'ผู้ประสานงานด้านกฎหมายและข้อบังคับ',           'Legal & Regulations Coordinator','SINGLE',  'PRESIDENT', 330)
ON CONFLICT (code) DO NOTHING;

-- --- Assistant Secretary (reports to Secretary) ---------------------------
INSERT INTO positions (code, name_th, name_en, cardinality, parent_position_code, display_order)
VALUES
    ('ASST_SECRETARY', 'ผู้ช่วยเลขาธิการ', 'Assistant Secretary', 'MULTIPLE', 'SECRETARY', 310)
ON CONFLICT (code) DO NOTHING;

-- --- Vice Presidents (each heads a division; report to President) ----------
INSERT INTO positions (code, name_th, name_en, cardinality, parent_position_code, display_order)
VALUES
    ('VP_ADMIN_INTERNAL',        'รองประธานฝ่ายบริหารและประสานงานภายใน',         'VP, Administration & Internal Coordination', 'SINGLE', 'PRESIDENT', 400),
    ('VP_BUSINESS_INNOVATION',   'รองประธานฝ่ายพัฒนาธุรกิจและนวัตกรรม',          'VP, Business Development & Innovation',       'SINGLE', 'PRESIDENT', 420),
    ('VP_NETWORK_INTERNATIONAL', 'รองประธานฝ่ายเครือข่ายและต่างประเทศ',          'VP, Network & International',                  'SINGLE', 'PRESIDENT', 440),
    ('VP_PR_IMAGE',              'รองประธานฝ่ายประชาสัมพันธ์และภาพลักษณ์',        'VP, Public Relations & Image',                'SINGLE', 'PRESIDENT', 460),
    ('VP_ACTIVITIES_RELATIONS',  'รองประธานฝ่ายกิจกรรมและสัมพันธ์สมาชิก',         'VP, Activities & Member Relations',           'SINGLE', 'PRESIDENT', 480),
    ('VP_DATA_REGISTRATION',     'รองประธานฝ่ายข้อมูลและทะเบียนสมาชิก',           'VP, Data & Member Registration',              'SINGLE', 'PRESIDENT', 500)
ON CONFLICT (code) DO NOTHING;

-- --- Committees (report to the matching VP; team roles, MULTIPLE) ----------
INSERT INTO positions (code, name_th, name_en, cardinality, parent_position_code, display_order)
VALUES
    ('COMM_ADMIN_INTERNAL',        'กรรมการฝ่ายบริหารและประสานงานภายใน',   'Committee, Administration & Internal Coordination', 'MULTIPLE', 'VP_ADMIN_INTERNAL',        410),
    ('COMM_BUSINESS_INNOVATION',   'กรรมการฝ่ายพัฒนาธุรกิจและนวัตกรรม',    'Committee, Business Development & Innovation',       'MULTIPLE', 'VP_BUSINESS_INNOVATION',   430),
    ('COMM_NETWORK_INTERNATIONAL', 'กรรมการฝ่ายเครือข่ายและต่างประเทศ',    'Committee, Network & International',                'MULTIPLE', 'VP_NETWORK_INTERNATIONAL', 450),
    ('COMM_PR_IMAGE',              'กรรมการฝ่ายประชาสัมพันธ์และภาพลักษณ์',  'Committee, Public Relations & Image',               'MULTIPLE', 'VP_PR_IMAGE',              470),
    ('COMM_ACTIVITIES_RELATIONS',  'กรรมการฝ่ายกิจกรรมและสัมพันธ์สมาชิก',   'Committee, Activities & Member Relations',          'MULTIPLE', 'VP_ACTIVITIES_RELATIONS',  490),
    ('COMM_DATA_REGISTRATION',     'กรรมการฝ่ายข้อมูลและทะเบียนสมาชิก',     'Committee, Data & Member Registration',             'MULTIPLE', 'VP_DATA_REGISTRATION',     510)
ON CONFLICT (code) DO NOTHING;

-- --- General membership (top of dropdown — most common selection) ----------
INSERT INTO positions (code, name_th, name_en, cardinality, parent_position_code, display_order)
VALUES
    ('GENERAL_MEMBER', 'สมาชิกทั่วไป', 'General Member', 'MULTIPLE', NULL, 100)
ON CONFLICT (code) DO NOTHING;

COMMIT;
