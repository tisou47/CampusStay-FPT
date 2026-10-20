import { useLocation } from 'react-router'

/** "/staff" or "/manager" (or "/admin") — lets shared back-office pages build links for the current portal. */
export function useRoleBase() {
  const { pathname } = useLocation()
  return `/${pathname.split('/')[1] || 'staff'}`
}
