const shapes = {
  atlas:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m16.5 7.5-3 6-6 3 3-6z"/>',
  residents:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5"/>',
  journal:'<path d="M5 4h12a2 2 0 0 1 2 2v15H7a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2zM4 17h15M8 4v9m3-5h5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  diagonal:'<path d="M6 18 18 6M7 6h11v11"/>',
  person:'<circle cx="12" cy="8" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
  leaf:'<path d="M20 3C9 3 4 7 4 13a7 7 0 0 0 7 7c6 0 9-7 9-17zM4 21l11-12"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0z"/><circle cx="12" cy="10" r="2"/>',
  spark:'<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3z"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  send:'<path d="m3 10 18-7-7 18-3-8zM11 13 21 3"/>',
  back:'<path d="M20 12H4m6 6-6-6 6-6"/>',
  box:'<path d="m3 7 9-5 9 5v10l-9 5-9-5zM3 7l9 5 9-5m-9 5v10"/>',
  radio:'<path d="M3 10h18v10H3zM5 10l13-7m-4 12h4m-4 2h4"/><circle cx="8" cy="15" r="2"/>',
  wave:'<path d="M2 9q3-4 6 0t6 0 6 0M2 15q3-4 6 0t6 0 6 0"/>',
  edit:'<path d="m4 20 4-1L20 7l-3-3L5 16zM14 7l3 3"/>',
  book:'<path d="M3 5q5-1 9 2 4-3 9-2v14q-5-1-9 2-4-3-9-2zM12 7v14"/>'
};
export function icon(name,size=18) {
  return '<svg aria-hidden="true" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+(shapes[name]||shapes.compass)+'</svg>';
}
export function wordmark() {
  return '<svg aria-hidden="true" viewBox="0 0 48 48" width="44" height="44" fill="none"><rect x="1" y="1" width="46" height="46" rx="13" fill="#285449"/><g stroke="#f5eed7" stroke-width="1.45" stroke-linejoin="round"><path d="M9 26c5-10 10-13 16-16-2 8 0 12 13 15-10 1-18-1-29 1Z"/><path d="M9 29c9-3 19 0 29-1M10 33c9-4 17 0 25-2M22 13c-3 6-2 10 3 11m-9-5c-1 3 0 4 2 6"/></g><circle cx="34" cy="14" r="2.3" fill="#d9bc75"/></svg>';
}
