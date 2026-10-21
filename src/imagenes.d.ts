// Las imágenes que importa el kit (los fondos del login, ADR-092) las resuelve
// el Vite de cada producto, que ya trae estos tipos con `vite/client`. El kit
// no lo tiene en su `tsconfig`, así que los declara él: un import da la URL.
declare module '*.jpg' {
  const url: string
  export default url
}
declare module '*.svg' {
  const url: string
  export default url
}
