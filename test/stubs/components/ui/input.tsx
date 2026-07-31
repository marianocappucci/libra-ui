// Stub del <Input> de shadcn: un <input> que reenvia todas las props.
//
// Alcanza para lo que se prueba aca -- que PasswordInput cambie el `type`,
// que propague `disabled`, que el `className` se mergee. El render interno
// de shadcn es dependencia de terceros y tiene sus propios tests; imitarlo
// solo agregaria una copia que se desactualiza.
import type { ComponentProps } from 'react'

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} />
}
