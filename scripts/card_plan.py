#!/usr/bin/env python3
"""
The card plan for a whole survey, ahead of fieldwork: the table the old R
script wrote, one row per planned respondent.

    python3 scripts/card_plan.py acbus-demo          # uses the survey's own target
    python3 scripts/card_plan.py acbus-demo 500
    python3 scripts/card_plan.py acbus-demo 500 123  # same plan every run (like set.seed)

Cards are dealt the way the tablets deal them (least-used first, ties at
random), so every card comes up equally often and no respondent sees the same
card twice in one block. This is a plan on paper: the app assigns each
interview its cards when the interview starts, so what the field actually
produces is `scripts/card_tables.py`, not this.
"""
import csv
import json
import random
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path


def table(name):
    # Into a file, not a pipe: the Convex CLI exits before a pipe has drained.
    with tempfile.TemporaryFile() as output:
        subprocess.run(
            ['npx', 'convex', 'data', name, '--limit', '8000', '--format', 'jsonl'],
            stdout=output, stderr=subprocess.PIPE, check=True,
        )
        output.seek(0)
        text = output.read().decode('utf-8')
    return [json.loads(line) for line in text.splitlines() if line.startswith('{')]


def deal(sets, count, used):
    """The `count` least-used cards, ties broken at random. Mirrors pickLeastUsed."""
    pool = list(sets)
    random.shuffle(pool)
    pool.sort(key=lambda s: used[s])
    chosen = pool[:count]
    random.shuffle(chosen)
    return chosen


def main():
    if not 2 <= len(sys.argv) <= 4:
        sys.exit('usage: python3 scripts/card_plan.py <survey id> [total responses] [seed]')
    survey = sys.argv[1]
    # Without a seed every run deals differently; with one the plan repeats exactly.
    if len(sys.argv) == 4:
        random.seed(int(sys.argv[3]))
    found = [q for q in table('questionnaires') if q['id'] == survey]
    if not found:
        sys.exit(f'No survey with id {survey}')
    questionnaire = found[0]
    target = int(sys.argv[2]) if len(sys.argv) >= 3 else questionnaire['responseTarget']
    if target <= 0:
        sys.exit('This survey has no response target yet; pass one, e.g. 500')
    blocks = [q for q in questionnaire['questions'] if q['type'] == 'choice_experiment' and q['cards']]
    if not blocks:
        sys.exit('This survey has no design cards')

    used = [Counter({card['set']: 0 for card in block['cards']}) for block in blocks]
    rows = []
    for respondent in range(1, target + 1):
        cells = []
        for block, counts in zip(blocks, used):
            drawn = deal(list(counts), block['scenariosPerRespondent'], counts)
            for set_number in drawn:
                counts[set_number] += 1
            cells += drawn
        rows.append([respondent] + cells)

    head = ['Set'] + [f'Scenario{i}' for i in range(1, len(rows[0]))]
    freq, col = [], 0
    for n, (block, counts) in enumerate(zip(blocks, used), 1):
        k = block['scenariosPerRespondent']
        cluster = f'Cluster {n} (Scenarios {col + 1}-{col + k})'
        freq += [[s, counts[s], cluster] for s in sorted(counts)]
        col += k

    out = Path('rough')
    out.mkdir(exist_ok=True)
    plan_file = out / f'card_plan_{survey}_{target}.csv'
    freq_file = out / f'card_plan_frequency_{survey}_{target}.csv'
    for file, header, body in [(plan_file, head, rows), (freq_file, ['Number', 'Frequency', 'Cluster'], freq)]:
        with open(file, 'w', newline='') as handle:
            writer = csv.writer(handle)
            writer.writerow(header)
            writer.writerows(body)

    print(f'{target} respondents x {len(head) - 1} scenarios\n')
    print(' '.join(h.rjust(9) for h in head))
    for row in rows[:10]:
        print(' '.join(str(c).rjust(9) for c in row))
    print(f'{"...".rjust(9)}  ({target - 10} more rows)\n')
    for cluster in sorted({f[2] for f in freq}):
        counts = [f[1] for f in freq if f[2] == cluster]
        print(f'{cluster}: {len(counts)} cards, {sum(counts)} showings, '
              f'each shown {min(counts)}-{max(counts)} times')
    print(f'\nWrote {plan_file} and {freq_file}')


if __name__ == '__main__':
    main()
