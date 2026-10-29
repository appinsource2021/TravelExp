import { createContext, useContext } from 'react'
import type { User } from '../types'

interface AppContextValue {
  user: User | null
  logout: () => void
}

export const AppContext = createContext<AppContextValue>({ user: null, logout: () => {} })
export const useAppContext = () => useContext(AppContext)
