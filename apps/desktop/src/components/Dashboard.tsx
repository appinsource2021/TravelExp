import type { User } from '../types'

interface Props {
  user: User
  onLogout: () => void
}

export function Dashboard({ user, onLogout }: Props) {
  return (
    <div style={styles.container}>
      <h1>Hoş geldin, {user.name} {user.surname}</h1>
      <button style={styles.btn} onClick={onLogout}>
        Çıkış Yap
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: 24,
  },
  btn: {
    padding: '10px 28px',
    background: '#e53e3e',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 15,
  },
}
