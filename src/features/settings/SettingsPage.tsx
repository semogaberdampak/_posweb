import { useTheme } from './theme'

export default function SettingsPage() {
  const { theme, toggle } = useTheme()
  return (
    <div className="max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Pengaturan</h1>
      <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow dark:bg-slate-800">
        <div>
          <div className="font-medium">Tema tampilan</div>
          <div className="text-sm text-slate-500">Saat ini: {theme === 'dark' ? 'Gelap' : 'Terang'}</div>
        </div>
        <button className="btn-primary" onClick={toggle}>
          Ganti ke {theme === 'dark' ? 'Terang' : 'Gelap'}
        </button>
      </div>
    </div>
  )
}
