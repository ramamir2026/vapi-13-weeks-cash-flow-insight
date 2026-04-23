DELETE FROM public.assumptions;

INSERT INTO public.assumptions (category, key, label, value, unit, notes) VALUES
-- Opening Cash
('Opening Cash', 'cash_svb_mm', 'SVB Money Market', 51428680, '$', NULL),
('Opening Cash', 'cash_brex_treasury', 'Brex Treasury', 5163683, '$', NULL),
('Opening Cash', 'cash_brex_primary', 'Brex Primary', 1040168, '$', NULL),
('Opening Cash', 'cash_svb_checking', 'SVB Analysis Checking', 250000, '$', NULL),
('Opening Cash', 'cash_stripe_clearing', 'Stripe Clearing', 65667, '$', NULL),

-- Inflows
('Inflows', 'stripe_daily_rate', 'Stripe Daily Rate', 64990, '$', '5 business days per week'),
('Inflows', 'stripe_growth_pct', 'Stripe MoM Growth %', 3, '%', 'Compounded monthly'),
('Inflows', 'enterprise_ach_weekly', 'Enterprise ACH Weekly', 344060, '$', NULL),

-- Payroll
('Payroll', 'payroll_semi_monthly', 'Base Semi-Monthly Payroll', 659000, '$', 'Already includes total employer cost'),
('Payroll', 'payroll_processing_fee', 'Payroll Processing Fee', 1500, '$', 'Per pay period'),

-- AI COGS
('AI COGS', 'cogs_anthropic', 'Anthropic', 386722, '$', 'Monthly base, 7% growth'),
('AI COGS', 'cogs_azure', 'Azure', 278221, '$', 'Monthly base, 7% growth'),
('AI COGS', 'cogs_openai', 'OpenAI', 252688, '$', 'Flat monthly'),
('AI COGS', 'cogs_elevenlabs', 'ElevenLabs', 111829, '$', 'Flat monthly'),
('AI COGS', 'cogs_deepgram', 'Deepgram', 277843, '$', 'One payment Apr 30 only'),
('AI COGS', 'cogs_pump_aws', 'Pump / AWS Reserved', 374471, '$', 'Monthly'),
('AI COGS', 'cogs_twilio', 'Twilio', 140000, '$', 'Monthly'),
('AI COGS', 'cogs_other', 'Other COGS', 96000, '$', 'Monthly, smoothed weekly'),

-- Brex Card
('Brex Card', 'brex_w2', 'April card paid May 1 (W2)', 540000, '$', NULL),
('Brex Card', 'brex_w7', 'May card paid Jun 1 (W7)', 551000, '$', NULL),
('Brex Card', 'brex_w11', 'June card paid Jul 1 (W11)', 562000, '$', NULL),

-- OpEx
('OpEx', 'opex_sm', 'S&M', 720000, '$', 'Includes Montgomery Entertainment $30K'),
('OpEx', 'opex_software', 'Software / ACH-only tools', 55000, '$', 'Monthly'),
('OpEx', 'opex_legal', 'Legal', 220403, '$', 'Monthly'),
('OpEx', 'opex_deel', 'Deel contractors', 231870, '$', 'Monthly'),
('OpEx', 'opex_hr_te', 'HR / T&E', 73552, '$', 'Monthly'),
('OpEx', 'opex_recruiting', 'Recruiting agencies', 165000, '$', 'Monthly'),
('OpEx', 'opex_ga', 'G&A', 75000, '$', 'Monthly'),

-- Rent
('Rent', 'rent_may_sep', 'Office rent May–Sep', 32417, '$', 'Monthly'),
('Rent', 'rent_oct_plus', 'Office rent Oct+', 64835, '$', 'Monthly'),

-- One-Time
('One-Time', 'one_time_vendor_w2', 'One-Time Vendor Payment W2 (Apr 27–May 1)', 460000, '$', 'Vendor TBD'),

-- Cash Threshold
('Cash Threshold', 'min_cash_threshold', 'Minimum Cash Balance', 15000000, '$', 'Alert when forecast dips below'),

-- A/R Delay
('A/R Delay', 'ar_delay_days', 'Delay Days', 0, 'days', 'Set to 45 for delayed scenario; shifts all A/R collection weeks by ROUND(days/7)');