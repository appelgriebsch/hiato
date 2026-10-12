/** Child of resolveMembershipMisses: argv pkg lang, stdin JSON words → stdout JSON booleans. */
import { readFileSync } from 'node:fs'
import { loadSpeller, spellerAccepts, type MembershipLang } from './lang-membership'

const [pkg, lang] = process.argv.slice(2) as [string, MembershipLang]
const words = JSON.parse(readFileSync(0, 'utf8')) as string[]
const spell = loadSpeller(pkg)
process.stdout.write(JSON.stringify(words.map((w) => spellerAccepts(spell, lang, w))))
