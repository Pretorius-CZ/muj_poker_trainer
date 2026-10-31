// GENEROVÁNO z engine/src/pots.ts — neupravuj přímo.
// Znovu vygeneruješ: node tools/build-web.mjs

/**
 * Dělení potu na main pot a side poty.
 *
 * Algoritmus je "vrstvený": seřadím unikátní výše vkladů a pro každou vrstvu
 * spočítám, kdo do ní přispěl a kdo na ni má nárok. Tím se správně vyřeší:
 *   - víc all-inů najednou,
 *   - vrácení nevolané části sázky (vrstva, na kterou má nárok jen jeden hráč),
 *   - žetony složené foldnutými hráči (přispívají, ale nemají nárok).
 */

                                  
               
                                                               
                 
                  
 

                      
                 
                                                            
                     
                                                                    
              
 

export function buildPots(contributions                            )        {
  const positive = contributions.filter((c) => c.amount > 0);
  if (positive.length === 0) return [];

  const levels = [...new Set(positive.map((c) => c.amount))].sort((a, b) => a - b);
  const pots        = [];
  let previous = 0;

  for (const level of levels) {
    const increment = level - previous;
    const contributors = positive.filter((c) => c.amount >= level);
    const amount = increment * contributors.length;
    if (amount > 0) {
      pots.push({
        amount,
        eligible: contributors.filter((c) => !c.folded).map((c) => c.seat),
        cap: level,
      });
    }
    previous = level;
  }

  return pots;
}
