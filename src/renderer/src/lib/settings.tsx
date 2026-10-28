import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { setBuddhistYear } from '@shared/dates'
import { setMoneyStyle } from '@shared/money'
import { DEFAULT_SETTINGS, type AppSettings, type SettingsPatch } from '@shared/portalModel'
import { errorMessage, meow, unwrap } from './api'

interface SettingsContextValue {
  settings: AppSettings
  /** Bumps when year/money style changes, so pages re-render with the new formatting. */
  epoch: number
  update: (patch: SettingsPatch) => Promise<string | null>
}

const SettingsContext = createContext<SettingsContextValue>({ settings: DEFAULT_SETTINGS, epoch: 0, update: async () => null })

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext)
}

/** Apply settings that live in the page itself (theme colours, date and money formatting). */
function apply(s: AppSettings): void {
  document.documentElement.dataset['theme'] = s.theme
  setBuddhistYear(s.yearStyle === 'be')
  setMoneyStyle(s.moneyStyle)
}

export function SettingsProvider(props: { children: ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [epoch, setEpoch] = useState(0)

  useEffect(() => {
    unwrap(meow().portal.settings.get()).then(
      (s) => {
        apply(s)
        setSettings(s)
        setEpoch((e) => e + 1)
      },
      () => undefined
    )
  }, [])

  /** Returns an error message, or null when saved. */
  const update = useCallback(async (patch: SettingsPatch): Promise<string | null> => {
    try {
      const next = await unwrap(meow().portal.settings.set(patch))
      apply(next)
      setSettings(next)
      if (patch.yearStyle !== undefined || patch.moneyStyle !== undefined) setEpoch((e) => e + 1)
      return null
    } catch (error) {
      return errorMessage(error)
    }
  }, [])

  return <SettingsContext.Provider value={{ settings, epoch, update }}>{props.children}</SettingsContext.Provider>
}
