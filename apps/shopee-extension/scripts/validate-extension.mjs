import fs from 'node:fs'
import path from 'node:path'

const requiredFiles = ['manifest.json', 'popup.html', 'popup.css', 'popup.js', 'content.js']
const root = path.resolve(import.meta.dirname, '..')

for (const file of requiredFiles) {
  const filePath = path.join(root, file)
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing extension file: ${file}`)
  }
}

JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
console.log('Shopee extension files are valid.')
