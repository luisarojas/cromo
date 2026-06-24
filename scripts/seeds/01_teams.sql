-- scripts/seeds/01_teams.sql
-- 48 qualified teams for FIFA World Cup 2026
-- Groups confirmed from the December 5, 2025 draw at the Kennedy Center

INSERT INTO teams (fifa_code, name, group_name) VALUES
-- Group A
('MEX', 'Mexico',               'A'),
('CZE', 'Czech Republic',       'A'),
('RSA', 'South Africa',         'A'),
('KOR', 'South Korea',          'A'),

-- Group B
('CAN', 'Canada',               'B'),
('BIH', 'Bosnia & Herzegovina', 'B'),
('QAT', 'Qatar',                'B'),
('SUI', 'Switzerland',          'B'),

-- Group C
('ESP', 'Spain',                'C'),
('ALG', 'Algeria',              'C'),
('JPN', 'Japan',                'C'),
('NZL', 'New Zealand',          'C'),

-- Group D
('USA', 'USA',                  'D'),
('PAR', 'Paraguay',             'D'),
('AUS', 'Australia',            'D'),
('TUR', 'Türkiye',              'D'),

-- Group E
('ARG', 'Argentina',            'E'),
('ECU', 'Ecuador',              'E'),
('SWE', 'Sweden',               'E'),
('CIV', 'Ivory Coast',          'E'),

-- Group F
('GER', 'Germany',              'F'),
('SCO', 'Scotland',             'F'),
('CUW', 'Curaçao',              'F'),
('IRN', 'Iran',                 'F'),

-- Group G
('BEL', 'Belgium',              'G'),
('EGY', 'Egypt',                'G'),
('JOR', 'Jordan',               'G'),
('HAI', 'Haiti',                'G'),

-- Group H
('POR', 'Portugal',             'H'),
('COL', 'Colombia',             'H'),
('UZB', 'Uzbekistan',           'H'),
('COD', 'Congo DR',             'H'),

-- Group I
('FRA', 'France',               'I'),
('NOR', 'Norway',               'I'),
('SEN', 'Senegal',              'I'),
('IRQ', 'Iraq',                 'I'),

-- Group J
('ENG', 'England',              'J'),
('NED', 'Netherlands',          'J'),
('GHA', 'Ghana',                'J'),
('TUN', 'Tunisia',              'J'),

-- Group K
('BRA', 'Brazil',               'K'),
('MAR', 'Morocco',              'K'),
('CRO', 'Croatia',              'K'),
('KSA', 'Saudi Arabia',         'K'),

-- Group L
('URU', 'Uruguay',              'L'),
('AUT', 'Austria',              'L'),
('PAN', 'Panama',               'L'),
('CPV', 'Cape Verde',           'L')

ON CONFLICT (fifa_code) DO UPDATE SET
  name       = EXCLUDED.name,
  group_name = EXCLUDED.group_name;
