// El consumidor expone `cn` en `@/lib/utils`; este paquete tiene la misma
// funcion en `src/utils.ts`. El stub reexporta la real, no una imitacion:
// asi los tests que verifican merge de clases (por ejemplo que un padding
// del consumidor le gane al `pr-9` de PasswordInput) prueban el
// comportamiento de verdad.
// Tres niveles arriba: test/stubs/lib -> test/stubs -> test -> raiz.
// Estaba en dos y nadie lo noto porque ningun test cargaba este stub
// todavia; lo delato el chequeo de tipos.
export { cn } from '../../../src/utils'
