"""Aplica un relevamiento de Zonaprop a zonas.json (datos reales + puntajes derivados).
Uso: python3 aplicar-relevamiento.py relevamiento.json zonas.json [zonas2.json ...]
relevamiento.json = {"fecha":"YYYY-MM-DD","mep":1580.9,"res":{...salida de relevamiento-zonaprop.js...}}
"""
import json, sys
MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

def main():
    rel = json.load(open(sys.argv[1], encoding='utf8'))
    fecha, mep, res = rel['fecha'], float(rel['mep']), rel['res']
    mes = MESES[int(fecha[5:7]) - 1] + ' ' + fecha[:4]
    datos = {}
    for k, r in res.items():
        if not r.get('venta_usd_m2'):
            continue
        y = None
        if r.get('alquiler_ars_m2') and r.get('n_alq', 0) >= 5:
            y = round(r['alquiler_ars_m2'] * 12 / (r['venta_usd_m2'] * mep) * 100, 1)
        datos[k] = dict(r, rentabilidad=y)
    ventas = [d['venta_usd_m2'] for d in datos.values()]
    ys = [d['rentabilidad'] for d in datos.values() if d['rentabilidad'] is not None]
    lo, hi = min(ventas), max(ventas)
    ylo, yhi = (min(ys), max(ys)) if ys else (0, 1)
    for path in sys.argv[2:]:
        d = json.load(open(path, encoding='utf8'))
        for z in d['zonas']:
            m = datos.get(z['id'])
            if not m:
                continue
            fiable = m['n_alq'] >= 15
            z['mercado'] = {
                'venta_usd_m2': m['venta_usd_m2'], 'n_venta': m['n_venta'], 'oferta_venta': m['oferta_venta'],
                'alquiler_ars_m2': m['alquiler_ars_m2'], 'n_alq': m['n_alq'], 'oferta_alquiler': m['oferta_alquiler'],
                'rentabilidad': m['rentabilidad'], 'renta_fiable': fiable,
                'fecha': fecha, 'mep': mep, 'fuente': 'Mediana de avisos de departamentos en Zonaprop'
            }
            # precio de entrada: más barato el m², más alto el puntaje (2 a 9)
            z['comprar']['entrada'] = round(9 - 7 * (m['venta_usd_m2'] - lo) / ((hi - lo) or 1))
            # rentabilidad: proporcional al rendimiento bruto (3 a 9); con pocos avisos, se acerca a 5
            if m['rentabilidad'] is not None:
                r = 3 + 6 * (m['rentabilidad'] - ylo) / ((yhi - ylo) or 1)
                z['comprar']['renta'] = round(r if fiable else (r + 5) / 2)
            z['precio'] = 'Departamentos: USD %s por m² (mediana de %d avisos de Zonaprop, %s)' % (
                format(m['venta_usd_m2'], ',').replace(',', '.'), m['n_venta'], mes)
            linea_r = ('Rentabilidad bruta estimada: %s%% anual (%s)' % (str(m['rentabilidad']).replace('.', ','), mes)) if m['rentabilidad'] is not None else None
            z['datos'] = [t for t in z.get('datos', []) if not t.startswith(('Departamentos: USD', 'Rentabilidad bruta estimada', 'Avisos publicados'))]
            extra = [z['precio']]
            if linea_r:
                extra.append(linea_r + ('' if fiable else ' — pocos avisos de alquiler'))
            extra.append('Avisos publicados en Zonaprop: %s en venta, %s en alquiler (%s)' % (m['oferta_venta'], m['oferta_alquiler'], mes))
            z['datos'] = extra + z['datos']
        d['actualizado'] = fecha
        d['version'] = d.get('version', 0) + 1
        json.dump(d, open(path, 'w', encoding='utf8'), ensure_ascii=False, indent=2)
        print('actualizado', path, 'version', d['version'])

if __name__ == '__main__':
    main()
