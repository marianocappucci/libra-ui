// El fondo de la pantalla de login (ADR-092): la foto del hero de la landing de
// cada marca, con el mismo velo oscuro que tiene allá. Las capas salen tal cual
// del `style.css` de cada `<producto>_web` (`.hero` y su `.hero::before`), así
// la app y su landing se ven de la misma familia; si una landing cambia su
// hero, se copia la foto acá y se actualizan sus capas.
//
// Las imágenes son de este paquete y no del producto: con `producto` el login
// ya sabe qué fondo le toca, y el producto sólo sube el pin. Vite las emite
// como archivos aparte (pesan 150–300 KB), así que cada app descarga sólo la
// suya y el resto queda en su `dist/` sin que nadie lo pida.
import type { CSSProperties } from 'react'
import type { Producto } from './identidad'

import contalibra from './fondos-de-login/contalibra.jpg'
import gestiolibra from './fondos-de-login/gestiolibra.jpg'
import librabot from './fondos-de-login/librabot.svg'
import libracargo from './fondos-de-login/libracargo.jpg'
import libraclub from './fondos-de-login/libraclub.jpg'
import libradesk from './fondos-de-login/libradesk.jpg'
import medlibra from './fondos-de-login/medlibra.jpg'
import restolibra from './fondos-de-login/restolibra.jpg'
import ventalibra from './fondos-de-login/ventalibra.jpg'

/** Las marcas con hero propio: los ocho productos y LibraBot (su panel usa este login). */
export type MarcaConFondo = Producto | 'librabot'

type Fondo = {
  imagen: string
  /** `background-position` del hero de la landing: qué parte de la foto queda a la vista. */
  encuadre: string
  /** Capas que van por encima de la foto: el velo oscuro y, si la landing lo tiene, el brillo del color de la marca. */
  velo: string[]
  /** El color que se ve mientras la foto carga (y si no carga). */
  base: string
}

const brillo = (rgb: string, alfa: number) => `radial-gradient(ellipse at 60% 40%, rgba(${rgb},${alfa}) 0%, transparent 65%)`
const veloVertical = (arriba: string, medio: string, abajo: string, corte = 55) =>
  `linear-gradient(to bottom, ${arriba} 0%, ${medio} ${corte}%, ${abajo} 100%)`

export const FONDOS_DE_LOGIN: Record<MarcaConFondo, Fondo> = {
  contalibra: {
    imagen: contalibra, encuadre: 'center center', base: '#0a1223',
    velo: [brillo('37,99,235', 0.18), veloVertical('rgba(10,18,35,.78)', 'rgba(10,18,35,.62)', 'rgba(10,18,35,.80)', 60)],
  },
  restolibra: {
    imagen: restolibra, encuadre: '40% center', base: '#1c1410',
    velo: [
      'radial-gradient(ellipse at 20% 20%, rgba(234,88,12,.30) 0%, transparent 55%)',
      'radial-gradient(ellipse at 85% 75%, rgba(194,65,12,.25) 0%, transparent 55%)',
      'linear-gradient(160deg, rgba(28,20,16,.88) 0%, rgba(28,20,16,.80) 55%, rgba(28,20,16,.92) 100%)',
    ],
  },
  gestiolibra: {
    imagen: gestiolibra, encuadre: '30% center', base: '#2e1065',
    velo: [brillo('124,58,237', 0.25), veloVertical('rgba(15,10,35,.86)', 'rgba(15,10,35,.70)', 'rgba(15,10,35,.90)')],
  },
  medlibra: {
    imagen: medlibra, encuadre: '40% center', base: '#042f2e',
    velo: [brillo('13,148,136', 0.25), veloVertical('rgba(4,20,20,.86)', 'rgba(4,20,20,.70)', 'rgba(4,20,20,.90)')],
  },
  ventalibra: {
    imagen: ventalibra, encuadre: '22% center', base: '#2a1505',
    velo: [brillo('217,119,6', 0.25), veloVertical('rgba(28,14,3,.88)', 'rgba(40,20,4,.70)', 'rgba(28,14,3,.92)')],
  },
  libradesk: {
    imagen: libradesk, encuadre: '45% 50%', base: '#1e1b4b',
    velo: [brillo('79,70,229', 0.25), veloVertical('rgba(15,14,40,.86)', 'rgba(15,14,40,.70)', 'rgba(15,14,40,.90)')],
  },
  libracargo: {
    imagen: libracargo, encuadre: '72% 60%', base: '#001233',
    velo: [brillo('1,44,131', 0.35), veloVertical('rgba(0,10,32,.84)', 'rgba(0,10,32,.64)', 'rgba(0,10,32,.88)')],
  },
  libraclub: {
    imagen: libraclub, encuadre: '90% 45%', base: '#04231a',
    velo: [brillo('1,123,75', 0.32), veloVertical('rgba(2,25,17,.86)', 'rgba(2,25,17,.68)', 'rgba(2,25,17,.90)')],
  },
  // Su hero es un dibujo (burbujas de chat), no una foto: va igual, con su velo.
  librabot: {
    imagen: librabot, encuadre: '70% center', base: '#1a0710',
    velo: [brillo('225,29,72', 0.28), veloVertical('rgba(26,7,16,.86)', 'rgba(40,10,24,.70)', 'rgba(26,7,16,.92)')],
  },
}

/** El `style` del contenedor de la pantalla: velo, foto y color base, en ese orden de capas. */
export function estiloDeFondo(marca: MarcaConFondo): CSSProperties {
  const { imagen, encuadre, velo, base } = FONDOS_DE_LOGIN[marca]
  return { background: [...velo, `url("${imagen}") ${encuadre} / cover no-repeat`, base].join(', ') }
}
