import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];

function filesIn(directory, extension) {
    return readdirSync(join(root, directory), { withFileTypes: true })
        .filter(entry => entry.isFile() && extname(entry.name) === extension)
        .map(entry => join(root, directory, entry.name));
}

const scripts = [
    ...filesIn('js', '.js'),
    ...filesIn('api', '.js'),
    join(root, 'sw.js')
];

for (const file of scripts) {
    try {
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (error) {
        failures.push(`JavaScript syntax: ${file}\n${error.stderr?.toString() || error.message}`);
    }
}

for (const file of filesIn('.', '.html')) {
    const html = readFileSync(file, 'utf8');
    const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
        .map(match => match[1].split(/[?#]/)[0])
        .filter(value => value && !/^(?:https?:|data:|mailto:|tel:|#|\/)/i.test(value));

    for (const reference of references) {
        if (!existsSync(resolve(root, reference))) {
            failures.push(`Missing local asset: ${reference} (referenced by ${file})`);
        }
    }

    const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map(match => match[1]);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    for (const id of new Set(duplicates)) failures.push(`Duplicate HTML id: ${id} (${file})`);
}

for (const jsonFile of ['manifest.json', 'vercel.json', 'package.json']) {
    try {
        JSON.parse(readFileSync(join(root, jsonFile), 'utf8'));
    } catch (error) {
        failures.push(`Invalid JSON: ${jsonFile} (${error.message})`);
    }
}

if (failures.length) {
    console.error(failures.join('\n\n'));
    process.exit(1);
}

console.log(`Order2Me verification passed: ${scripts.length} scripts and ${filesIn('.', '.html').length} pages checked.`);
