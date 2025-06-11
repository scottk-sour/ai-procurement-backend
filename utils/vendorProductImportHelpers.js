// Converts '12:0.7;24:0.65;36:0.6' => [{term:12,margin:0.7},{term:24,margin:0.65},...]
export function parseLeaseTermsAndMargins(str) {
    if (!str) return [];
    return str.split(';').map(pair => {
      const [term, margin] = pair.split(':');
      if (term && margin) return { term: parseInt(term, 10), margin: parseFloat(margin) };
      return null;
    }).filter(Boolean);
  }
  
  // Converts 'booklet finisher:250;fax:80' => [{item:"booklet finisher", price:250}, ...]
  export function parseAuxiliaries(str) {
    if (!str) return [];
    return str.split(';').map(pair => {
      const [item, price] = pair.split(':');
      if (item && price) return { item: item.trim(), price: Number(price) };
      return null;
    }).filter(Boolean);
  }
  
  // Converts 'feature1;feature2' => ['feature1', 'feature2']
  export function parseSemicolonList(str) {
    if (!str) return [];
    return str.split(';').map(s => s.trim()).filter(Boolean);
  }
  