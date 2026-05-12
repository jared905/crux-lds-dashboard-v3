/**
 * RecipesBar — pre-built comparison scopes that teach by example.
 *
 * Loads saved_views where config._recipe = true (org-wide demo presets seeded
 * by migration 066). Clicking a recipe sets scope and switches the active lens.
 */
import React, { useEffect, useState } from 'react';
import { Sparkles, ChevronDown } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

export default function RecipesBar({ onApply }) {
  const [recipes, setRecipes] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      const { data } = await supabase
        .from('saved_views')
        .select('id, name, lens, config')
        .eq('surface', 'research')
        .order('sort_order', { ascending: true });
      if (cancelled) return;
      const onlyRecipes = (data || []).filter(v => v.config?._recipe === true);
      setRecipes(onlyRecipes);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!recipes.length) return null;

  const apply = (recipe) => {
    setOpen(false);
    const cfg = recipe.config || {};
    onApply({
      lens: recipe.lens,
      scope: {
        categoryIds: cfg.categoryIds || [],
        tags: cfg.tags || [],
        tiers: cfg.tiers || ['priority', 'tracked'],
        search: cfg.search || '',
        windowDays: cfg.windowDays || 30,
      },
    });
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block', marginBottom: 10 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', fontSize: 12, fontWeight: 600,
          background: '#15151a',
          color: '#d4d4d8',
          border: '1px solid #232328',
          borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
        }}
        title="Pre-built comparison scopes that teach the mechanic by doing it"
      >
        <Sparkles size={12} style={{ color: '#a78bfa' }} />
        Comparison recipes
        <ChevronDown size={12} style={{ opacity: 0.7 }} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 91,
            background: '#1c1c20', border: '1px solid #2a2a30', borderRadius: 8,
            padding: 4, minWidth: 360, maxWidth: 460,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: '#666',
              textTransform: 'uppercase', letterSpacing: '0.6px',
              padding: '8px 10px 4px',
            }}>Click a recipe to load its scope</div>
            {recipes.map(r => (
              <button
                key={r.id}
                onClick={() => apply(r)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: 'transparent', border: 'none',
                  padding: '9px 10px', borderRadius: 6,
                  fontFamily: 'inherit', cursor: 'pointer',
                  color: '#d4d4d8',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#252528'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.4px',
                    color: '#a78bfa', background: 'rgba(167,139,250,0.10)',
                    border: '1px solid rgba(167,139,250,0.25)',
                    padding: '1px 6px', borderRadius: 3, textTransform: 'uppercase',
                  }}>{r.lens || 'landscape'}</span>
                </div>
                {r.config?._description && (
                  <div style={{ fontSize: 11, color: '#888', lineHeight: 1.4 }}>
                    {r.config._description}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                  {(r.config?.tags || []).map(t => (
                    <span key={t} style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 3,
                      background: '#15151a', border: '1px solid #232328', color: '#aaa',
                    }}>{t}</span>
                  ))}
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 3,
                    background: '#15151a', border: '1px solid #232328', color: '#666',
                  }}>{r.config?.windowDays || 30}d</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
