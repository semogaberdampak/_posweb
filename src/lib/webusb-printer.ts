// src/lib/webusb-printer.ts

export async function requestUSBPrinter(): Promise<USBDevice | null> {
  try {
    if (!('usb' in navigator)) {
      alert('Browser Anda tidak mendukung WebUSB API. Gunakan Chrome atau Brave.')
      return null
    }

    const device = await navigator.usb.requestDevice({ filters: [] })
    await device.open()

    if (device.configuration === null) {
      await device.selectConfiguration(1)
    }

    try {
      await device.claimInterface(0)
    } catch (claimErr) {
      console.warn('Gagal claim interface 0, mencoba interface alternatif:', claimErr)
      if (device.configuration && device.configuration.interfaces.length > 1) {
        await device.claimInterface(1)
      }
    }

    localStorage.setItem('usb_printer_connected', 'true')
    return device
  } catch (error) {
    console.error('Gagal memilih atau menghubungkan printer USB:', error)
    return null
  }
}

/** Mencoba cetak langsung ke printer USB.
 *  Mengembalikan true bila data benar-benar terkirim ke perangkat.
 *  TIDAK memanggil window.print(); pemanggil yang memutuskan fallback agar tidak tercetak dua kali. */
export async function printDirectNota(notaData: {
  storeName?: string
  transNo?: string
  items: Array<{ name: string; qty: number; price: number }>
  total: number
}): Promise<boolean> {
  try {
    if (!('usb' in navigator)) return false

    const devices = await navigator.usb.getDevices()
    if (devices.length === 0) return false

    const device = devices[0]
    if (!device.opened) {
      await device.open()
      if (device.configuration === null) {
        await device.selectConfiguration(1)
      }

      try {
        await device.claimInterface(0)
      } catch {
        if (device.configuration && device.configuration.interfaces.length > 1) {
          await device.claimInterface(1)
        }
      }
    }

    const encoder = new TextEncoder()
    let text = `\x1b\x40` // Reset printer
    text += `\x1b\x61\x01` // Rata tengah
    text += `${notaData.storeName || 'TOKO KASIR'}\n`
    text += `No: ${notaData.transNo || '-'}\n`
    text += `--------------------------------\n`
    text += `\x1b\x61\x00` // Rata kiri

    notaData.items.forEach((item) => {
      text += `${item.name}\n`
      text += `${item.qty} x ${item.price.toLocaleString('id-ID')} = ${(item.qty * item.price).toLocaleString('id-ID')}\n`
    })

    text += `--------------------------------\n`
    text += `\x1b\x61\x02` // Rata kanan
    text += `TOTAL: Rp ${notaData.total.toLocaleString('id-ID')}\n`
    text += `--------------------------------\n\n\n`
    text += `\x1d\x56\x41\x03` // Auto Cut

    const data = encoder.encode(text)

    const targetInterface = device.configuration?.interfaces.find((i) =>
      i.alternate.endpoints.some((e) => e.direction === 'out')
    )
    const endpointNumber =
      targetInterface?.alternate.endpoints.find((e) => e.direction === 'out')?.endpointNumber || 1

    const result = await device.transferOut(endpointNumber, data)
    return result.status === 'ok'
  } catch (error) {
    console.error('Direct print WebUSB gagal, memakai fallback cetak browser:', error)
    return false
  }
}
