// Topic catalog: claim-issue starting points. Each entry is [id, label, search terms].
export const TOPICS = [
  ['trees', 'Trees & debris removal', ['tree', 'trees', 'debris removal', 'fallen limb', 'landscaping']],
  ['water', 'Sudden water discharge', ['accidental discharge', 'overflow of water', 'sudden and accidental', 'plumbing', 'household appliance']],
  ['leak', 'Repeated leaks & seepage', ['constant or repeated', 'seepage', 'leakage', '14 days', 'fourteen days']],
  ['flood', 'Flood & surface water', ['flood', 'surface water', 'storm surge', 'tidal water', 'waves']],
  ['backup', 'Sewer, drain & sump backup', ['sewer', 'sewers', 'drains', 'sump', 'backs up', 'backs-up']],
  ['ground', 'Groundwater & foundation seepage', ['below the surface', 'subsurface', 'hydrostatic', 'seeps', 'foundation']],
  ['roofwater', 'Rain through roof or openings', ['wind driven rain', 'wind-driven rain', 'opening in a roof', 'roof or wall', 'rain', 'roof leak']],
  ['freeze', 'Frozen pipes & appliances', ['freezing', 'frozen', 'maintain heat', 'drain all systems']],
  ['wind', 'Wind, hail & hurricanes', ['windstorm', 'hail', 'hurricane', 'wind or hail', 'windstorm or hail']],
  ['wear', 'Wear, deterioration & maintenance', ['wear and tear', 'wear, tear', 'deterioration', 'maintenance', 'mechanical breakdown', 'faulty', 'defective']],
  ['mold', 'Mold, fungi & rot', ['mold', 'fungi', 'fungus', 'wet rot', 'dry rot', 'bacteria']],
  ['food', 'Food loss & power failure', ['food', 'spoilage', 'spoiled', 'refrigerat', 'power failure', 'utility service', 'power interruption']],
  ['matching', 'Matching & undamaged property', ['matching', 'undamaged', 'cosmetic', 'aesthetic', 'uniform appearance']],
  ['settlement', 'Deductibles & payment limits', ['deductible', 'actual cash value', 'replacement cost', 'loss settlement', 'limit of liability', 'special limits']],
  ['duties', 'Notice, mitigation & claim duties', ['duties after loss', 'prompt notice', 'give notice', 'protect the property', 'neglect', 'proof of loss', 'reasonable emergency']],
  ['use', 'Loss of use & living expenses', ['additional living expense', 'loss of use', 'fair rental value', 'not fit to live', 'unfit for its normal use']],
];

export const COMMON = ['trees', 'wind', 'wear', 'mold', 'food', 'matching', 'settlement', 'duties', 'use', 'water'];
export const WATER = ['water', 'leak', 'flood', 'backup', 'ground', 'roofwater', 'freeze'];

export const TOPIC_CATALOG = TOPICS.map(([id, label, terms]) => ({ id, label, terms }));
