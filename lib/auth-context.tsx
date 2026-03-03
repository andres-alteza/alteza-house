"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react"
import {
  auth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "@/lib/firebase"
import { api } from "@/lib/api-client"

export type UserRole = "admin" | "tenant"

export interface User {
  id: string
  firebaseUid: string
  email: string
  name: string
  role: UserRole
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isAdmin: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log("[v0] Setting up onAuthStateChanged listener")
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser: FirebaseUser | null) => {
        console.log("[v0] onAuthStateChanged fired, user:", firebaseUser?.email || "null")
        if (firebaseUser) {
          try {
            const token = await firebaseUser.getIdToken()
            console.log("[v0] Got ID token, calling verify API...")
            const data = await api.verifyToken(token)
            console.log("[v0] Verify API response:", data)
            setUser(data.user)
          } catch (error) {
            console.error("[v0] Failed to verify token:", error)
            setUser(null)
          }
        } else {
          console.log("[v0] No firebase user, showing login")
          setUser(null)
        }
        setLoading(false)
      }
    )
    return () => unsubscribe()
  }, [])

  const login = async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password)
    const token = await credential.user.getIdToken()
    const data = await api.verifyToken(token)
    setUser(data.user)
  }

  const sendPasswordReset = async (email: string) => {
    await api.requestPasswordReset(email)
  }

  const logout = async () => {
    await signOut(auth)
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === "admin",
        loading,
        login,
        sendPasswordReset,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
