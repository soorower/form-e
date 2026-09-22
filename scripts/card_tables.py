#!/usr/bin/env python3
"""
Rough card tables for one survey, straight from Convex (nothing to do with the
website). The same two tables the old R script wrote, but from what the
tablets actually showed:

  rough/card_choice_set_<survey>.csv   Set, SurveyNo, Scenario1..N (card shown)
  rough/card_frequency_<survey>.csv    Number, Frequency, Cluster

A cluster is one choice-experiment block; its scenarios are numbered on from
the block before it (3 blocks x 3 scenarios = Scenario1..Scenario9).

    python3 scripts/card_tables.py acbus-demo
"""
import csv
import json
import subprocess
import sys
import tempfile
from pathlib import Path


def table(name):
    # Into a file, not a pipe: the Convex CLI exits before a pipe has drained,
    # which cut the output off at 96 KB (in the middle of a Bangla character).
    with tempfile.TemporaryFile() as output:
        subprocess.run(
            ['npx', 'convex', 'data', name, '--limit', '8000', '--format', 'jsonl'],
            stdout=output, stderr=subprocess.PIPE, check=True,
        )
        output.seek(0)
        text = output.read().decode('utf-8')
    return [json.loads(line) for line in text.splitlines() if line.startswith('{')]


def main():
    if len(sys.argv) != 2:
        sys.exit('usage: python3 scripts/card_tables.py <survey id (last part of its URL)>')
    survey = sys.argv[1]
    found = [q for q in table('questionnaires') if q['id'] == survey]
    if not found:
        sys.exit(f'No survey with id {survey}')
    blocks = [q for q in found[0]['questions'] if q['type'] == 'choice_experiment' and q['cards']]
    per = [b['scenariosPerRespondent'] for b in blocks]
    responses = sorted(
        (r for r in table('responses') if r['questionnaireId'] == survey),
        key=lambda r: r['serial'],
    )

    head = ['Set', 'SurveyNo'] + [f'Scenario{i}' for i in range(1, sum(per) + 1)]
    rows, skipped = [], []
    for r in responses:
        answers = r.get('answers') or {}
        cells = []
        for block, k in zip(blocks, per):
            shown = [s.get('set') for s in (answers.get(block['id']) or {}).get('scenarios', [])]
            cells += (shown + [''] * k)[:k]
        if all(c == '' for c in cells):
            skipped.append(r['surveyNumber'])
        else:
            rows.append([r['serial'], r['surveyNumber']] + cells)

    freq, col = [], 0
    for n, (block, k) in enumerate(zip(blocks, per), 1):
        cluster = f'Cluster {n} (Scenarios {col + 1}-{col + k})'
        counts = {card['set']: 0 for card in block['cards']}
        for row in rows:
            for value in row[2 + col:2 + col + k]:
                if value != '':
                    counts[value] = counts.get(value, 0) + 1
        freq += [[number, counts[number], cluster] for number in sorted(counts)]
        col += k

    out = Path('rough')
    out.mkdir(exist_ok=True)
    for file, header, body in [
        (out / f'card_choice_set_{survey}.csv', head, rows),
        (out / f'card_frequency_{survey}.csv', ['Number', 'Frequency', 'Cluster'], freq),
    ]:
        with open(file, 'w', newline='') as handle:
            writer = csv.writer(handle)
            writer.writerow(header)
            writer.writerows(body)

    print('Card choice sets, one row per response:')
    print(' '.join(h.rjust(9) for h in head))
    for row in rows:
        print(' '.join(str(c).rjust(9) for c in row))
    if skipped:
        print(f'\nNo cards in: {", ".join(skipped)}')
    clusters = sorted({f[2] for f in freq})
    for cluster in clusters:
        part = [f for f in freq if f[2] == cluster]
        counts = [p[1] for p in part]
        print(f'\n{cluster}: {sum(counts)} showings, least {min(counts)}, most {max(counts)}')
        for i in range(0, len(part), 10):
            print('  ' + '  '.join(f'{p[0]:>3}:{p[1]}' for p in part[i:i + 10]))
    print(f'\nWrote {out}/card_choice_set_{survey}.csv and {out}/card_frequency_{survey}.csv')


if __name__ == '__main__':
    main()
