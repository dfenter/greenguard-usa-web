#!/usr/bin/env python3
"""
PAD-NET ORACLE — CO2 Timer v5 netlist verifier
Usage: python3 check_padnets.py <file.kicad_pcb>

Parses the given KiCad PCB file, extracts actual pad->net assignments per
footprint, diffs against padnet_expected.json (v5 datasheet-verified netlist),
and reports PASS or per-pad mismatches.

Exit codes:
  0  All checked pads match (PASS)
  1  One or more mismatches detected (FAIL)
  2  Usage / file error
"""

import json
import os
import sys


# ---------------------------------------------------------------------------
# KiCad PCB s-expression parser
# ---------------------------------------------------------------------------

def tokenize(text):
    """Tokenize KiCad s-expression text into atoms and parens."""
    tokens = []
    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        if c in '()':
            tokens.append(c)
            i += 1
        elif c == '"':
            # Quoted string — collect until closing quote (handle backslash escape)
            j = i + 1
            while j < n and text[j] != '"':
                if text[j] == '\\':
                    j += 1
                j += 1
            tokens.append(text[i + 1:j])
            i = j + 1
        elif c in ' \t\n\r':
            i += 1
        else:
            # Unquoted atom
            j = i
            while j < n and text[j] not in ' \t\n\r()"':
                j += 1
            tokens.append(text[i:j])
            i = j
    return tokens


def parse_sexp(tokens, pos):
    """Recursively parse s-expression tokens starting at pos.
    Returns (node, next_pos) where node is either a string or a list."""
    if tokens[pos] == '(':
        pos += 1
        result = []
        while tokens[pos] != ')':
            child, pos = parse_sexp(tokens, pos)
            result.append(child)
        pos += 1  # consume ')'
        return result, pos
    else:
        return tokens[pos], pos + 1


# ---------------------------------------------------------------------------
# PCB data extraction
# ---------------------------------------------------------------------------

def find_all(node, tag):
    """Yield every child list whose first element equals tag."""
    if isinstance(node, list):
        for child in node:
            if isinstance(child, list) and child and child[0] == tag:
                yield child
            else:
                yield from find_all(child, tag)


def get_property(fp_node, prop_name):
    """Return the value of a (property <name> <value>) child, or None."""
    for child in fp_node:
        if (isinstance(child, list) and len(child) >= 3
                and child[0] == 'property' and child[1] == prop_name):
            return child[2]
    return None


def extract_footprints(tree):
    """
    Return dict: refdes -> {refdes, footprint, pads: {pad_num: net_or_None}}
    """
    result = {}
    for fp in find_all(tree, 'footprint'):
        fp_name = fp[1] if len(fp) > 1 else '?'
        ref = get_property(fp, 'Reference')
        if ref is None:
            continue

        pads = {}
        for pad in (c for c in fp if isinstance(c, list) and c and c[0] == 'pad'):
            pad_num = str(pad[1]) if len(pad) > 1 else '?'
            net = None
            for attr in pad:
                if isinstance(attr, list) and attr and attr[0] == 'net':
                    # Format: (net "<name>")  or (net <num> "<name>")
                    # In KiCad 7+ the number was dropped; handle both.
                    if len(attr) == 2:
                        net = attr[1]
                    elif len(attr) == 3:
                        net = attr[2]
                    break
            pads[pad_num] = net

        result[ref] = {'refdes': ref, 'footprint': fp_name, 'pads': pads}
    return result


# ---------------------------------------------------------------------------
# Net name normalisation
# ---------------------------------------------------------------------------

# Map v4 net names to v5 equivalents so the checker can flag structural errors
# (wrong net connected) rather than just name-collision noise.
# Keys are v4 legacy names; values are the v5 canonical names.
# The checker uses this ONLY to explain mismatches — matching is always done
# on exact v5 net names, so a v4 file with wrong names correctly FAILS.
_V4_TO_V5_ALIAS = {
    'VCC':         '+3V3',
    'VIN':         'VM',
    'BARREL':      'VIN_DC',
    'BAT1':        'VBAT1_IN',
    'BAT1_FUSED':  'VIN_OR',
    'BAT2':        'VBAT2_IN',
    'INT':         '/ALERT',
    'AOUT1':       'SOL_OUT1',
    'AOUT2':       'SOL_OUT2',
    'VCP':         'ILIM',          # v4 DRV8833 bootstrap cap net; maps loosely
    '32KHZ':       'NC',
    'BTN_UP':      'BTN_UP',
    'BTN_SET':     'BTN_SET',
}


def net_alias_hint(actual, expected):
    """Return a hint string if actual is a known v4 alias for expected."""
    alias = _V4_TO_V5_ALIAS.get(actual)
    if alias and alias == expected:
        return f' (v4 alias for {expected!r})'
    if actual in _V4_TO_V5_ALIAS:
        return f' (v4 alias -> {_V4_TO_V5_ALIAS[actual]!r})'
    return ''


# ---------------------------------------------------------------------------
# Comparison logic
#
# "NC" pads in padnet_expected.json are treated specially:
#   - If the PCB has no net on that pad (None) -> OK
#   - If the PCB has any net -> mismatch (should be floating / no-connect)
# ---------------------------------------------------------------------------

def check_pad(ref, pad_num, expected_net, actual_net):
    """
    Returns (ok: bool, message: str | None).
    ok=True means this pad passes.
    """
    # Normalise None/absent
    actual_str = actual_net if actual_net else '<no net>'

    if expected_net == 'NC':
        # Should be unconnected (floating) or explicitly NC
        if actual_net is None or actual_net.upper() in ('NC', 'PWR_FLAG'):
            return True, None
        return False, (
            f"  {ref} pad {pad_num}: expected NC (unconnected), "
            f"got {actual_str!r}"
        )

    if actual_net is None:
        return False, (
            f"  {ref} pad {pad_num}: expected {expected_net!r}, "
            f"got <no net>"
        )

    if actual_net == expected_net:
        return True, None

    hint = net_alias_hint(actual_net, expected_net)
    return False, (
        f"  {ref} pad {pad_num}: expected {expected_net!r}, "
        f"got {actual_str!r}{hint}"
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <file.kicad_pcb>", file=sys.stderr)
        sys.exit(2)

    pcb_path = sys.argv[1]
    expected_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                 'padnet_expected.json')

    # Load expected netlist
    try:
        with open(expected_path, 'r') as f:
            expected_db = json.load(f)
    except FileNotFoundError:
        print(f"ERROR: padnet_expected.json not found at {expected_path}", file=sys.stderr)
        sys.exit(2)

    # Load and parse PCB
    try:
        with open(pcb_path, 'r') as f:
            pcb_text = f.read()
    except FileNotFoundError:
        print(f"ERROR: PCB file not found: {pcb_path}", file=sys.stderr)
        sys.exit(2)

    print(f"Parsing {os.path.basename(pcb_path)} ...", end=' ', flush=True)
    tokens = tokenize(pcb_text)
    tree, _ = parse_sexp(tokens, 0)
    actual_db = extract_footprints(tree)
    print(f"found {len(actual_db)} footprints.")

    # Diff
    mismatches = []   # list of (refdes, pad_num, expected_net, actual_net, msg)
    missing_refs = []
    pad_checked = 0
    pad_passed = 0

    for refdes, exp_entry in sorted(expected_db.items()):
        if refdes.startswith('_'):
            continue
        if refdes not in actual_db:
            missing_refs.append(refdes)
            continue

        actual_entry = actual_db[refdes]
        exp_pads = exp_entry['pads']

        for pad_num, expected_net in exp_pads.items():
            actual_net = actual_entry['pads'].get(pad_num)
            pad_checked += 1
            ok, msg = check_pad(refdes, pad_num, expected_net, actual_net)
            if ok:
                pad_passed += 1
            else:
                mismatches.append((refdes, pad_num, expected_net, actual_net, msg))

    # Report
    print()
    if missing_refs:
        print(f"MISSING refdes (not in PCB): {', '.join(sorted(missing_refs))}")
        print()

    if mismatches:
        print(f"FAIL  --  {len(mismatches)} mismatch(es) found "
              f"({pad_passed}/{pad_checked} pads passed)\n")

        # Group by refdes for readability
        current_ref = None
        for (ref, pad_num, exp_net, act_net, msg) in mismatches:
            if ref != current_ref:
                current_ref = ref
                fp_name = actual_db.get(ref, {}).get('footprint', '?')
                print(f"[{ref}] ({fp_name})")
            print(msg)
        print()
        sys.exit(1)

    else:
        print(f"PASS  --  all {pad_checked} pads match v5 expected netlist.")
        sys.exit(0)


if __name__ == '__main__':
    main()
