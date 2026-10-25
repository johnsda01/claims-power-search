// Topic catalog: claim-issue starting points. Each entry is [id, label, search terms].
export const TOPICS = [
  // Common coverage issues
  ['trees', 'Trees & debris removal', ['tree', 'trees', 'debris removal', 'fallen limb', 'landscaping']],
  ['wind', 'Wind, hail & hurricanes', ['windstorm', 'hail', 'hurricane', 'wind or hail', 'windstorm or hail']],
  ['wear', 'Wear, deterioration & maintenance', ['wear and tear', 'wear, tear', 'deterioration', 'maintenance', 'mechanical breakdown', 'faulty', 'defective']],
  ['mold', 'Mold, fungi & rot', ['mold', 'fungi', 'fungus', 'wet rot', 'dry rot', 'bacteria']],
  ['food', 'Food loss & power failure', ['food', 'spoilage', 'spoiled', 'refrigerat', 'power failure', 'utility service', 'power interruption']],
  ['matching', 'Matching & undamaged property', ['matching', 'undamaged', 'cosmetic', 'aesthetic', 'uniform appearance']],
  ['settlement', 'Deductibles & payment limits', ['deductible', 'actual cash value', 'replacement cost', 'loss settlement', 'limit of liability', 'special limits']],
  ['duties', 'Notice, mitigation & claim duties', ['duties after loss', 'prompt notice', 'give notice', 'protect the property', 'neglect', 'proof of loss', 'reasonable emergency']],
  ['use', 'Loss of use & living expenses', ['additional living expense', 'loss of use', 'fair rental value', 'not fit to live', 'unfit for its normal use']],
  ['water', 'Sudden water discharge', ['accidental discharge', 'overflow of water', 'sudden and accidental', 'plumbing', 'household appliance']],
  ['jewelry', 'Special limits: jewelry, furs & valuables', ['jewelry', 'watches', 'furs', 'precious metals', 'gemstones', 'special limit', ' theft']],
  ['ordinance', 'Ordinance or law & code upgrades', ['ordinance or law', 'building code', 'code upgrade', 'enforcement of any ordinance', 'law']],
  ['vacancy', 'Vacancy & unoccupancy', ['vacant', 'vacancy', 'unoccupied', 'unoccupancy', 'deserted']],
  ['anticurrent', 'Anti-concurrent causation', ['anti-concurrent', 'anticoncurrent', 'concurrent', 'sequential', 'efficient cause', 'order of events']],
  // Water damage types
  ['leak', 'Repeated leaks & seepage', ['constant or repeated', 'seepage', 'leakage', '14 days', 'fourteen days']],
  ['flood', 'Flood & surface water', ['flood', 'surface water', 'storm surge', 'tidal water', 'waves']],
  ['backup', 'Sewer, drain & sump backup', ['sewer', 'sewers', 'drains', 'sump', 'backs up', 'backs-up']],
  ['ground', 'Groundwater & foundation seepage', ['below the surface', 'subsurface', 'hydrostatic', 'seeps', 'foundation']],
  ['roofwater', 'Rain through roof or openings', ['wind driven rain', 'wind-driven rain', 'opening in a roof', 'roof or wall', 'rain', 'roof leak']],
  ['freeze', 'Frozen pipes & appliances', ['freezing', 'frozen', 'maintain heat', 'drain all systems']],
  ['tearout', 'Tear-out & access to plumbing', ['tear out', 'tear-out', 'access to', 'opening a wall', 'opening a floor', 'excavation', 'plumbing system']],
  // Roof & wind damage types
  ['roofsurface', 'Roof surface endorsements', ['roof surface', 'replacement cost', 'actual cash value', 'roof endorsement', 'scheduled roof', 'windstorm or hail']],
  ['cosmetichail', 'Cosmetic hail damage', ['cosmetic', 'cosmetic damage', 'appearance', 'staining', 'discoloration', 'granule loss']],
  ['sanddebris', 'Sand, dust & debris entry', ['sand', 'dust', 'debris', 'wind-driven', 'driven sand', 'abrasive']],
  // Structure & exclusion types
  ['fences', 'Fences & other structures (attached vs. detached)', ['fence', 'fences', 'other structures', 'detached', 'attached', 'appurtenant']],
  ['earth', 'Earth movement & foundation', ['earth movement', 'earthquake', 'landslide', 'mudflow', 'sinking', 'shifting', 'foundation']],
  ['faultywork', 'Faulty workmanship & design', ['faulty workmanship', 'faulty design', 'defective construction', 'defective materials', 'workmanship']],
  ['collapse', 'Collapse & hidden decay', ['collapse', 'hidden decay', 'hidden damage', 'gradual deterioration', 'imminent collapse']],
  ['vermin', 'Vermin, insects & animals', ['vermin', 'rodents', 'insects', 'termites', 'birds', 'animals', 'nesting']],
];

export const COMMON = ['trees', 'wind', 'wear', 'mold', 'food', 'matching', 'settlement', 'duties', 'use', 'water', 'jewelry', 'ordinance', 'vacancy', 'anticurrent'];
export const WATER = ['water', 'leak', 'flood', 'backup', 'ground', 'roofwater', 'freeze', 'tearout'];
export const ROOF = ['roofsurface', 'cosmetichail', 'sanddebris'];
export const STRUCTURE = ['fences', 'earth', 'faultywork', 'collapse', 'vermin'];

export const TOPIC_CATALOG = TOPICS.map(([id, label, terms]) => ({ id, label, terms }));
