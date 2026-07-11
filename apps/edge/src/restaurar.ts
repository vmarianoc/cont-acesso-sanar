import { readdirSync, existsSync } from 'node:fs'
import { restaurarBackup } from './backup.js'

// npm run restaurar            → lista os backups disponíveis
// npm run restaurar -- <pasta> → restaura config+estado daquele backup
const pasta = process.argv[2]
if (!pasta) {
  console.log('Backups disponíveis (backups/):')
  if (existsSync('backups')) for (const d of readdirSync('backups').sort().reverse()) console.log('  ' + d)
  console.log('\nUso: npm run restaurar -- <pasta>')
  process.exit(0)
}
restaurarBackup(pasta)
