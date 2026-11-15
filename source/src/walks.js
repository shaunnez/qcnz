// The walks in the app. Distances and days are the Department of Conservation figures.
export const WALKS = [
  { id: 'qct', name: 'Queen Charlotte Track', region: 'Marlborough Sounds', km: 73.5, days: '3–5', boat: true, lat: -41.17, lon: 174.08 },
  { id: 'abeltasman', name: 'Abel Tasman Coast Track', region: 'Abel Tasman National Park', km: 60, days: '3–5', tags: ['coast', 'forest', 'weka', 'nikau'] },
  { id: 'heaphy', name: 'Heaphy Track', region: 'Kahurangi National Park', km: 78.4, days: '4–6', tags: ['forest', 'tussock', 'coast', 'kiwi', 'takahe', 'kea', 'weka', 'nikau'] },
  { id: 'humpridge', name: 'Hump Ridge Track', region: 'Fiordland, south coast', km: 60, days: '3', tags: ['forest', 'tussock', 'coast', 'kea', 'hector'] },
  { id: 'kepler', name: 'Kepler Track', region: 'Fiordland National Park', km: 60, days: '3–4', tags: ['forest', 'tussock', 'lake', 'kea', 'whio', 'kiwi'] },
  { id: 'waikaremoana', name: 'Lake Waikaremoana', region: 'Te Urewera', km: 46, days: '3–4', tags: ['forest', 'lake', 'kiwi', 'kaka'] },
  { id: 'milford', name: 'Milford Track', region: 'Fiordland National Park', km: 53.5, days: '4', tags: ['forest', 'tussock', 'river', 'kea', 'whio', 'kiwi', 'weka'] },
  { id: 'paparoa', name: 'Paparoa Track', region: 'Paparoa National Park', km: 55, days: '2–3', tags: ['forest', 'tussock', 'river', 'kiwi', 'kea', 'whio', 'weka', 'nikau'] },
  { id: 'rakiura', name: 'Rakiura Track', region: 'Stewart Island / Rakiura', km: 32, days: '3', tags: ['forest', 'coast', 'kiwi', 'kaka', 'rakiura'] },
  { id: 'routeburn', name: 'Routeburn Track', region: 'Fiordland and Mount Aspiring', km: 32, days: '2–4', tags: ['forest', 'tussock', 'river', 'kea', 'whio', 'mohua'] },
  { id: 'tongariro', name: 'Tongariro Northern Circuit', region: 'Tongariro National Park', km: 43, days: '3–4', tags: ['tussock', 'volcanic', 'forest'] },
  { id: 'whanganui', name: 'Whanganui Journey', region: 'Whanganui National Park', km: 145, days: '3–5', mode: 'paddle', tags: ['forest', 'river', 'kiwi', 'bat', 'nikau'] }
];
export const GENERIC_HELP = {
  lines: [
    'Life in danger: call 111. Ask for police, ambulance or fire.',
    'Most of this track has no phone signal. Carry a personal locator beacon and use it if a life is in danger.',
    'In the Great Walks season, hut wardens have a radio. Send a person to the nearest hut if you cannot move.',
    'Tell a person your plan before you start, and tell them when you are out.'],
  office: '0800 362 468', officeName: 'DOC',
  foot: 'DOC emergency line: 0800 DOC HOT (0800 362 468). Read the DOC alerts for this track before you go. Carry all waste out.'
};
// Wildlife and plants. Each walk shows the entries that match its tags.
const WILD = [
  ['forest', 'tui', 'Tūī', 'Dark bird with a white tuft at the throat and a blue-green shine. It feeds on nectar.'],
  ['forest', 'korimako', 'Korimako / bellbird', 'Olive green. You hear it before you see it. The song is like small bells.'],
  ['forest', 'kereru', 'Kererū / wood pigeon', 'Large, green and bronze with a white front. You hear the loud wings first.'],
  ['forest', 'robin', 'Toutouwai / robin', 'Small and grey. It comes within 2 m of you to catch the insects that you disturb.'],
  ['forest', 'piwakawaka', 'Pīwakawaka / fantail', 'Follows walkers and fans its tail.'],
  ['forest', 'miromiro', 'Miromiro / tomtit', 'Small bird with a large head. The male is black and white or black and yellow.'],
  ['forest', 'riroriro', 'Riroriro / grey warbler', 'Very small and grey. The long song goes up and down.'],
  ['forest', 'titipounamu', 'Tītipounamu / rifleman', 'The smallest bird in New Zealand. It climbs tree trunks in beech forest.'],
  ['forest', 'ruru', 'Ruru / morepork', 'Owl. Listen for the two-note call at the hut after dark.'],
  ['weka', 'weka', 'Weka', 'Brown bird that cannot fly. It takes things into the bush to look at them. Do not feed it.'],
  ['forest', 'kakariki', 'Kākāriki / parakeet', 'Small green parrot. Listen for fast chatter high in the trees.'],
  ['forest', 'ponga', 'Ponga / silver fern', 'Turn a frond over to see the silver side. It is the national emblem.'],
  ['forest', 'glowworm', 'Glow-worms', 'On damp banks and under overhangs near the huts after dark.'],
  ['kaka', 'kaka', 'Kākā', 'Large brown forest parrot with red under the wings. Loud calls at dawn and dusk.'],
  ['kea', 'kea', 'Kea', 'Mountain parrot, olive green with orange under the wings. It pulls at packs and boots. Do not feed it.'],
  ['kiwi', 'kiwi', 'Kiwi', 'Listen after dark: the male call is a high whistle that he repeats. You see a kiwi only with luck.'],
  ['whio', 'whio', 'Whio / blue duck', 'Grey-blue duck that lives in fast rivers. The male whistles.'],
  ['takahe', 'takahe', 'Takahē', 'Large blue and green bird that cannot fly, with a heavy red bill. Released on the Gouland Downs.'],
  ['mohua', 'mohua', 'Mohua / yellowhead', 'Small bird with a bright yellow head, in beech forest. It is rare.'],
  ['tussock', 'pipit', 'Pīhoihoi / pipit', 'Brown bird on open tops. It walks ahead of you on the track and flicks its tail.'],
  ['tussock', 'rockwren', 'Rock wren', 'Very small bird that bobs on rocks above the bush line. It is rare.'],
  ['tussock', 'karearea', 'Kārearea / falcon', 'Fast bird of prey. It can dive at people who come near its nest.'],
  ['tussock', 'buttercup', 'Mountain buttercup', 'Large white flowers in damp places above the bush line, in early summer.'],
  ['tussock', 'daisy', 'Mountain daisy', 'White daisies with silver leaves, among the tussock.'],
  ['coast', 'oyster', 'Variable oystercatcher', 'Black shore bird with an orange bill. It nests on beaches: keep away from the nests.'],
  ['coast', 'shag', 'Shag', 'Dark diving bird. It dries its wings on rocks and jetties.'],
  ['coast', 'korora', 'Kororā / little blue penguin', 'Near the shore at dusk. You hear it more than you see it.'],
  ['coast', 'seal', 'Kekeno / fur seal', 'On rocky points. Stay 20 m away.'],
  ['coast', 'dolphin', 'Dolphins', 'Look from high points and beaches on calm days.'],
  ['nikau', 'nikaupalm', 'Nīkau palm', 'The only palm that is native to New Zealand. It grows near the coast.'],
  ['hector', 'hector', "Hector's dolphin", 'Small dolphin with a round fin. It swims in the surf of the south coast.'],
  ['rakiura', 'tokoeka', 'Rakiura tokoeka', 'The Stewart Island kiwi. It is sometimes active in daylight.'],
  ['rakiura', 'whitetail', 'White-tailed deer', 'Small deer near the coast, most often at dawn and dusk.'],
  ['lake', 'kawau', 'Kawau / black shag', 'Large dark shag on the lake.'],
  ['lake', 'shelduck', 'Pūtangitangi / paradise shelduck', 'Large duck, often in pairs. The female has a white head.'],
  ['river', 'tuna', 'Tuna / longfin eel', 'Large eels in deep pools. Look from bridges.'],
  ['river', 'trout', 'Trout', 'In clear pools. Look from the swing bridges.'],
  ['river', 'kotare', 'Kōtare / kingfisher', 'Blue-green bird with a large bill. It sits on branches over the water.'],
  ['bat', 'pekapeka', 'Pekapeka / long-tailed bat', 'Small bat that flies over the river at dusk.'],
  ['volcanic', 'crater', 'Steam vents', 'White steam from the ground near the craters. Stay on the track.'],
  ['volcanic', 'pumice', 'Pumice', 'Pale rock that is light enough to float. Do not take rocks away.'],
  ['volcanic', 'heather', 'Heather', 'Purple weed from Europe that covers the lower slopes.']
];
export function wildlifeFor(meta) {
  const tags = meta.tags || ['forest'], seen = {};
  return WILD.filter(w => tags.includes(w[0]) && !seen[w[1]] && (seen[w[1]] = 1)).map(w => ({ id: w[1], name: w[2], tip: w[3] }));
}
