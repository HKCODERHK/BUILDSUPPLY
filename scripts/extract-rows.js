// Pulls the row array out of a `supabase db query` response and writes it as
// JSON. Lives in its own file rather than inline in the PowerShell script:
// embedding JavaScript in a here-string means fighting two sets of quoting
// rules at once, and the closing marker has to sit at column zero, which is
// easy to break and fails as a parse error rather than anything readable.
//
//   node extract-rows.js <output-path> <input-path>
//   node extract-rows.js <output-path>          (CLI output on stdin)
//
// Prefer the two-argument form. Handing the file path over means Node reads
// the CLI's UTF-8 bytes directly; routed through PowerShell instead, the text
// passes through Get-Content's default codepage and then through the pipe's
// $OutputEncoding, which is ASCII by default in Windows PowerShell 5.1 and
// silently turns every em-dash and bullet into '?'. That is what corrupted
// every scheduled backup between 13 and 21 September 2026.
//
// Prints the row count on success; exits non-zero with a message on failure,
// so the caller can stop rather than write half a backup.
const fs = require('fs')

const outPath = process.argv[2]
if (!outPath) {
  console.error('usage: node extract-rows.js <output-path>')
  process.exit(2)
}

const inPath = process.argv[3]

function handle(raw) {
  try {
    // The payload may start with either bracket, and the CLI sometimes prints
    // a line of its own first, so find whichever comes first rather than
    // assuming an object.
    const candidates = [raw.indexOf('{'), raw.indexOf('[')].filter((i) => i !== -1)
    if (!candidates.length) throw new Error('no JSON in CLI output: ' + raw.trim().slice(0, 200))
    const parsed = JSON.parse(raw.slice(Math.min(...candidates)))

    if (parsed && parsed.error) {
      throw new Error(parsed.error.message || 'query returned an error')
    }

    // Two shapes, depending on how the CLI was invoked. An interactive shell
    // gets {boundary, rows:[{data}]}; --output-format json under a scheduled
    // task gets a bare [{data}]. Accept either, because the backup runs both
    // ways and silently taking the wrong branch would write an empty file
    // that still looks like a successful backup.
    const wrapper = Array.isArray(parsed) ? parsed[0] : parsed.rows && parsed.rows[0]
    if (!wrapper) throw new Error('no result row in response')

    const rows = wrapper.data
    if (!Array.isArray(rows)) throw new Error('expected an array of rows, got ' + typeof rows)

    fs.writeFileSync(outPath, JSON.stringify(rows, null, 1))
    console.log(rows.length)
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}

if (inPath) {
  // Read as UTF-8 regardless of the console's codepage.
  handle(fs.existsSync(inPath) ? fs.readFileSync(inPath, 'utf8') : '')
} else {
  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => (raw += chunk))
  process.stdin.on('end', () => handle(raw))
}
