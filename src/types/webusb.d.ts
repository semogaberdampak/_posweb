// Deklarasi tipe WebUSB minimal (subset yang dipakai src/lib/webusb-printer.ts).
// Lib DOM TypeScript belum memuat WebUSB, dan proyek tidak ingin menambah dependensi
// hanya untuk tipe. Bila kelak memakai @types/w3c-web-usb, file ini boleh dihapus.

type USBDirection = 'in' | 'out'
type USBTransferStatus = 'ok' | 'stall' | 'babble'

interface USBEndpoint {
  readonly endpointNumber: number
  readonly direction: USBDirection
  readonly type: 'bulk' | 'interrupt' | 'isochronous'
  readonly packetSize: number
}

interface USBAlternateInterface {
  readonly alternateSetting: number
  readonly interfaceClass: number
  readonly interfaceSubclass: number
  readonly interfaceProtocol: number
  readonly interfaceName: string | undefined
  readonly endpoints: readonly USBEndpoint[]
}

interface USBInterface {
  readonly interfaceNumber: number
  readonly alternate: USBAlternateInterface
  readonly alternates: readonly USBAlternateInterface[]
  readonly claimed: boolean
}

interface USBConfiguration {
  readonly configurationValue: number
  readonly configurationName: string | undefined
  readonly interfaces: readonly USBInterface[]
}

interface USBOutTransferResult {
  readonly status: USBTransferStatus
  readonly bytesWritten: number
}

interface USBInTransferResult {
  readonly status: USBTransferStatus
  readonly data: DataView
}

interface USBDeviceFilter {
  vendorId?: number
  productId?: number
  classCode?: number
  subclassCode?: number
  protocolCode?: number
  serialNumber?: string
}

interface USBDeviceRequestOptions {
  filters: USBDeviceFilter[]
}

interface USBDevice {
  readonly opened: boolean
  readonly vendorId: number
  readonly productId: number
  readonly productName: string | undefined
  readonly manufacturerName: string | undefined
  readonly serialNumber: string | undefined
  readonly configuration: USBConfiguration | null
  readonly configurations: readonly USBConfiguration[]
  open(): Promise<void>
  close(): Promise<void>
  forget(): Promise<void>
  selectConfiguration(configurationValue: number): Promise<void>
  claimInterface(interfaceNumber: number): Promise<void>
  releaseInterface(interfaceNumber: number): Promise<void>
  transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>
  transferIn(endpointNumber: number, length: number): Promise<USBInTransferResult>
}

interface USB {
  getDevices(): Promise<USBDevice[]>
  requestDevice(options?: USBDeviceRequestOptions): Promise<USBDevice>
  addEventListener(type: 'connect' | 'disconnect', listener: (event: Event) => void): void
  removeEventListener(type: 'connect' | 'disconnect', listener: (event: Event) => void): void
}

interface Navigator {
  // Tidak semua browser punya WebUSB; selalu cek `'usb' in navigator` sebelum memakai.
  readonly usb: USB
}
