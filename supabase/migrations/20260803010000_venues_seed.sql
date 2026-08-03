-- ============================================================================
-- VENUE SEED (starter set)
--
-- ~100 well-known UK carp waters that anglers are likely to name in the first
-- weeks. This is NOT a complete directory of UK carp venues — there are
-- several thousand, and no reliable open dataset of them exists.
--
-- The rest of the venue list should come from anglers. The schema already
-- supports it: created_by records who added a venue, approved gates whether
-- it shows in the picker, and merged_into lets duplicates be folded together
-- without deleting anyone's catch history (see the venue_merge migration).
--
-- Fisheries close, change hands and rename constantly, and syndicate waters
-- are sometimes private about appearing in apps — be prepared to correct or
-- remove entries on request.
-- ============================================================================

insert into venues (name, county, water_type, approved) values

-- Oxfordshire ---------------------------------------------------------------
('Linear Fisheries - Brasenose One',   'Oxfordshire', 'day_ticket', true),
('Linear Fisheries - Brasenose Two',   'Oxfordshire', 'day_ticket', true),
('Linear Fisheries - Oxlease',         'Oxfordshire', 'day_ticket', true),
('Linear Fisheries - Hardwick',        'Oxfordshire', 'day_ticket', true),
('Linear Fisheries - Smiths Pool',     'Oxfordshire', 'day_ticket', true),
('Linear Fisheries - St Johns',        'Oxfordshire', 'day_ticket', true),
('Linear Fisheries - Manor Farm',      'Oxfordshire', 'day_ticket', true),
('Linear Fisheries - Guys Pool',       'Oxfordshire', 'day_ticket', true),
('Linear Fisheries - Unity Lake',      'Oxfordshire', 'day_ticket', true),
('Orchid Lakes',                       'Oxfordshire', 'day_ticket', true),
('Queenford Lakes',                    'Oxfordshire', 'syndicate',  true),

-- Berkshire -----------------------------------------------------------------
('Wraysbury One',                      'Berkshire',   'syndicate',  true),
('Wraysbury Two',                      'Berkshire',   'syndicate',  true),
('Horton Church Lake',                 'Berkshire',   'syndicate',  true),
('Farlows Lake',                       'Berkshire',   'day_ticket', true),
('Sandhurst Lake',                     'Berkshire',   'day_ticket', true),
('Dinton Pastures',                    'Berkshire',   'club',       true),
('Burghfield Lake',                    'Berkshire',   'syndicate',  true),
('Theale Lagoon',                      'Berkshire',   'club',       true),
('Wasing Estate',                      'Berkshire',   'syndicate',  true),

-- Hampshire -----------------------------------------------------------------
('Yateley - Car Park Lake',            'Hampshire',   'syndicate',  true),
('Yateley - Match Lake',               'Hampshire',   'day_ticket', true),
('Yateley - North Lake',               'Hampshire',   'syndicate',  true),
('Yateley - Pads Lake',                'Hampshire',   'syndicate',  true),
('Broadlands Lake',                    'Hampshire',   'day_ticket', true),
('Rooksbury Mill',                     'Hampshire',   'day_ticket', true),

-- Surrey --------------------------------------------------------------------
('Frimley Pits',                       'Surrey',      'club',       true),
('Papercourt Lake',                    'Surrey',      'club',       true),
('Old Bury Hill Lake',                 'Surrey',      'day_ticket', true),
('Kingsmead Island Lake',              'Surrey',      'syndicate',  true),
('Chertsey Lakes',                     'Surrey',      'club',       true),

-- Kent ----------------------------------------------------------------------
('Sutton at Hone',                     'Kent',        'syndicate',  true),
('Darenth Complex',                    'Kent',        'day_ticket', true),
('Elphicks Fishery',                   'Kent',        'day_ticket', true),
('Monk Lakes',                         'Kent',        'day_ticket', true),
('Brooklands Lake',                    'Kent',        'day_ticket', true),
('Johnsons Lakes',                     'Kent',        'syndicate',  true),
('Yalding Fisheries',                  'Kent',        'day_ticket', true),

-- Essex ---------------------------------------------------------------------
('Berners Hall Fishery',               'Essex',       'day_ticket', true),
('Layer Pits',                         'Essex',       'syndicate',  true),
('Cranham Brickpits',                  'Essex',       'club',       true),
('Wintersmere',                        'Essex',       'day_ticket', true),

-- Cambridgeshire ------------------------------------------------------------
('Bluebell Lakes - Swan Lake',         'Cambridgeshire', 'day_ticket', true),
('Bluebell Lakes - Kingfisher Lake',   'Cambridgeshire', 'day_ticket', true),
('Holme Fen Fishery',                  'Cambridgeshire', 'day_ticket', true),
('Milton Park Lakes',                  'Cambridgeshire', 'day_ticket', true),
('Fen Drayton',                        'Cambridgeshire', 'club',       true),
('Mill Farm Fishery',                  'Cambridgeshire', 'day_ticket', true),

-- Northamptonshire ----------------------------------------------------------
('Stanwick Lakes - Specimen Lake',     'Northamptonshire', 'day_ticket', true),
('Ringstead Grange',                   'Northamptonshire', 'day_ticket', true),
('Sywell Reservoir',                   'Northamptonshire', 'club',       true),

-- Nottinghamshire -------------------------------------------------------------
('Cromwell Lake',                      'Nottinghamshire', 'day_ticket', true),
('Aldercar Lane Fishery',              'Nottinghamshire', 'day_ticket', true),

-- Lincolnshire ----------------------------------------------------------------
('Stickney Brick Pit',                 'Lincolnshire', 'syndicate',  true),
('Willow Lakes',                       'Lincolnshire', 'day_ticket', true),
('Toft Newton',                        'Lincolnshire', 'day_ticket', true),

-- Herefordshire / Worcestershire ----------------------------------------------
('Redmire Pool',                       'Herefordshire', 'syndicate', true),
('Lechlade Trout Fishery',             'Gloucestershire', 'day_ticket', true),

-- Wiltshire / Gloucestershire --------------------------------------------------
('Shearwater Lake',                    'Wiltshire',   'day_ticket', true),
('Cotswold Water Park - Manor Farm',   'Wiltshire',   'day_ticket', true),
('Cherry Lakes',                       'Gloucestershire', 'day_ticket', true),
('Lechlade & Bushyleaze',              'Gloucestershire', 'day_ticket', true),

-- Dorset / Somerset / Devon / Cornwall ------------------------------------------
('Todber Manor Fisheries',             'Dorset',      'day_ticket', true),
('Hillview Lakes',                     'Dorset',      'day_ticket', true),
('Viaduct Fishery',                    'Somerset',    'day_ticket', true),
('The Sedges',                         'Somerset',    'day_ticket', true),
('Anglers Eldorado',                   'Devon',       'day_ticket', true),
('Milemead Fisheries',                 'Devon',       'day_ticket', true),
('White Acres',                        'Cornwall',    'day_ticket', true),
('Bake Lakes',                         'Cornwall',    'day_ticket', true),

-- Sussex ------------------------------------------------------------------------
('Sumners Ponds',                      'West Sussex', 'day_ticket', true),
('Furnace Brook Fishery',              'East Sussex', 'day_ticket', true),
('Hawkhurst Fish Farm',                'East Sussex', 'day_ticket', true),

-- Buckinghamshire / Bedfordshire / Hertfordshire --------------------------------
('Willen Lake',                        'Buckinghamshire', 'club',    true),
('Emberton Park',                      'Buckinghamshire', 'day_ticket', true),
('Bedford Ouse',                       'Bedfordshire',    'club',    true),
('Broxbourne Lakes',                   'Hertfordshire',   'club',    true),

-- Warwickshire / Leicestershire / Staffordshire ---------------------------------
('Makins Fishery',                     'Warwickshire', 'day_ticket', true),
('Napton Reservoir',                   'Warwickshire', 'day_ticket', true),
('Mallory Park Fisheries',             'Leicestershire', 'day_ticket', true),
('Pool House Farm',                    'Staffordshire', 'day_ticket', true),
('Izaak Walton Fishery',               'Staffordshire', 'day_ticket', true),

-- Cheshire / Lancashire / Cumbria -----------------------------------------------
('Redesmere',                          'Cheshire',    'club',       true),
('Capesthorne Hall Lakes',             'Cheshire',    'day_ticket', true),
('Partridge Lakes',                    'Lancashire',  'day_ticket', true),
('Lakeside Fishery',                   'Cumbria',     'day_ticket', true),

-- Yorkshire -----------------------------------------------------------------
('Elvington Lakes',                    'North Yorkshire', 'day_ticket', true),
('Willow Garth Fishery',               'North Yorkshire', 'day_ticket', true),
('Lakeside Fisheries Doncaster',       'South Yorkshire', 'day_ticket', true),

-- Norfolk / Suffolk -----------------------------------------------------------
('Taswood Lakes',                      'Norfolk',     'day_ticket', true),
('Bawburgh Lakes',                     'Norfolk',     'day_ticket', true),
('Barham Broads',                      'Suffolk',     'day_ticket', true),
('Alton Water',                        'Suffolk',     'club',       true),

-- Wales -----------------------------------------------------------------------
('Garnffrwd Park',                     'Carmarthenshire', 'day_ticket', true),
('Llyn Y Gors',                        'Anglesey',    'day_ticket', true),
('Cefni Reservoir',                    'Anglesey',    'club',       true),

-- Scotland ----------------------------------------------------------------------
('Castle Loch',                        'Dumfries and Galloway', 'day_ticket', true),
('Lochmaben Kirk Loch',                'Dumfries and Galloway', 'club',   true);

-- Case-insensitive index so the picker search and the merge tool's
-- near-duplicate lookups stay fast as the venue list grows from user
-- submissions.
create index venues_name_lower_idx on venues (lower(name));
