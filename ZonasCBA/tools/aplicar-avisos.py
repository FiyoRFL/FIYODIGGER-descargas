"""Arma LorealState/data/avisos.json (oportunidades y comparables) a partir del relevamiento.
Uso: python3 aplicar-avisos.py relevamiento.json avisos-crudos.json geo-nuevo.json zonas.json salida-avisos.json geocache.json
- relevamiento.json: {"fecha","mep","res"} (igual que para aplicar-relevamiento.py)
- avisos-crudos.json: lista de window.__avisos
- geo-nuevo.json: window.__geoNew (direcciones ubicadas en esta corrida)
- zonas.json: para el alquiler por m² de cada barrio
- salida-avisos.json: se lee la versión anterior (si existe) para detectar bajas de precio
- geocache.json: caché de ubicaciones (se actualiza)
"""
import json, re, sys, statistics


def cargar(p, defecto):
    try:
        return json.load(open(p, encoding='utf8'))
    except Exception:
        return defecto


def main():
    rel, crudos, geonew, zonas, salida, cachep = sys.argv[1:7]
    rel = cargar(rel, {})
    fecha, mep = rel['fecha'], float(rel['mep'])
    avisos = cargar(crudos, [])
    cache = cargar(cachep, {})
    cache.update(cargar(geonew, {}))
    json.dump(cache, open(cachep, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
    zs = {z['id']: z for z in cargar(zonas, {}).get('zonas', [])}
    previo = {a['id']: a for a in cargar(salida, {}).get('avisos', [])}

    # mediana de USD/m² por barrio con los avisos de esta corrida
    por_z = {}
    for a in avisos:
        por_z.setdefault(a['z'], []).append(a['p'] / a['m2'])
    medianas = {k: statistics.median(v) for k, v in por_z.items() if v}

    out, vistos = [], set()
    for a in avisos:
        if a['id'] in vistos or a['z'] not in medianas:
            continue
        vistos.add(a['id'])
        m2p = a['p'] / a['m2']
        x = {k: a.get(k) for k in ('id', 'z', 'u', 'p', 'm2', 'amb', 'dorm', 'banos', 'coch', 'dir')}
        x['m2p'] = round(m2p)
        x['vs'] = round((m2p / medianas[a['z']] - 1) * 100)  # % contra la mediana del barrio
        alq = (zs.get(a['z'], {}).get('mercado') or {}).get('alquiler_ars_m2')
        x['renta'] = round(alq * a['m2'] * 12 / (a['p'] * mep) * 100, 1) if alq else None
        if a.get('pozo'):
            x['pozo'] = 1
        if a.get('estrenar'):
            x['estrenar'] = 1
        ant = previo.get(a['id'])
        x['visto'] = ant.get('visto', fecha) if ant else fecha
        if ant and ant.get('p') and a['p'] < ant['p']:
            x['p_ant'] = ant['p']
        elif ant and ant.get('p_ant') and a['p'] < ant['p_ant']:
            x['p_ant'] = ant['p_ant']
        geo = cache.get(re.sub(r'\s+al\s+', ' ', a['dir'], flags=re.I) + '|' + a['z']) if a.get('dir') else None
        if geo:
            x['lat'], x['lng'] = geo
        out.append({k: v for k, v in x.items() if v not in (None, '')})

    json.dump({'fecha': fecha, 'mep': mep, 'fuente': 'Avisos de departamentos en venta publicados en Zonaprop',
               'medianas': {k: round(v) for k, v in medianas.items()}, 'avisos': out},
              open(salida, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
    con_geo = sum(1 for a in out if 'lat' in a)
    bajas = sum(1 for a in out if 'p_ant' in a)
    print('avisos', len(out), 'ubicados', con_geo, 'bajaron', bajas)


if __name__ == '__main__':
    main()
