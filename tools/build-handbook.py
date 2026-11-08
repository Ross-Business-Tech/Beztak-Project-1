"""Turn the handbook text (pdftotext -layout) into searchable chunks.
Usage: python3 tools/build-handbook.py manual.txt src/data/handbook.json
Each chunk keeps its section number/title and page so answers can cite it."""
import json, re, sys

src, out = sys.argv[1], sys.argv[2]
lines = open(src, encoding='utf-8').read().split('\n')

page = 1
section = (0, 'About this handbook')
chunks, buf, title = [], [], None

sub = None
def flush():
    global buf, title, sub
    text = ' '.join(' '.join(buf).split())
    if title is None and len(buf) == 1 and len(text) < 60 and not text.endswith('.') and ' — ' not in text:
        sub = text; buf = []; return  # a small subheading: use as context for what follows
    if title is None and ' — ' in text:
        buf = []; return  # table rows are curated by hand in src/data/curated.js
    if text and section[0] > 0:
        chunks.append({'id': len(chunks), 'section': section[0], 'sectionTitle': section[1],
                       'page': page, 'q': title, 'sub': sub, 'text': text})
    buf, title = [], None

sec_re = re.compile(r'^\s{0,3}(\d{1,2})\. ([A-Z][^.]{3,})$')
app_re = re.compile(r'^\s{0,3}APPENDIX ([A-D]) — (.+)$')
foot_re = re.compile(r'GLPG \| FICTIONAL DEMONSTRATION MANUAL.*Page (\d+)')
for raw in lines:
    m = foot_re.search(raw)
    if m:
        flush(); page = int(m.group(1)) + 1; continue
    line = raw.rstrip()
    if page <= 3:  # cover + contents
        continue
    s = sec_re.match(line) or app_re.match(line)
    if s and s.re is sec_re and int(s.group(1)) != section[0] + 1:
        s = None  # numbered table row, not a new section
    if s:
        flush()
        sub = None
        if s.re is app_re:
            section = (100 + 'ABCD'.index(s.group(1)), 'Appendix ' + s.group(1) + ' — ' + s.group(2).title())
        else:
            section = (int(s.group(1)), s.group(2).strip())
        continue
    st = line.strip()
    if not st:
        if buf and title is None: flush()
        continue
    if st.startswith('PART ') and st.isupper():
        flush(); continue
    if st.endswith('?') and len(st) < 110 and not st.startswith('•'):
        flush(); title = st; continue
    if title is None and buf and st.startswith('•'):
        flush()
    # collapse table gaps into " — "
    buf.append(re.sub(r'\s{2,}', ' — ', st))
flush()

# section titles that wrapped onto two lines in the PDF
fix = {6: 'Accommodations, Pregnancy-Related Needs, and Religious Practices',
       7: 'Hiring, Background Checks, Onboarding, and Introductory Period',22: 'Fair Housing, Accessibility, and Ethical Real Estate Practice',
       24: 'Property Access, Keys, Showings, Vendors, and Resident Interactions',
       102: 'Appendix C — HR Acuity-Informed Design Notes and References'}
for c in chunks:
    c['sectionTitle'] = fix.get(c['section'], c['sectionTitle'])
chunks = [c for c in chunks if not re.fullmatch(r'(Practice|Interactions|References)', c['text']) and c['section'] != 102]
# merge bullet lists under the same heading into one answer
merged = []
for c in chunks:
    if c['section'] == 7: c['sub'] = None  # "Period" is a wrapped title, not a subheading
    if c['section'] == 22: c['text'] = re.sub(r'^Practice ', '', c['text'])
    if c['section'] in (34, 103) or c['text'].startswith('Employee acknowledgment'):
        continue  # scenarios and the config register are curated by hand
    if (not c['q'] and c['text'].startswith('•') and merged and not merged[-1]['q']
            and merged[-1]['section'] == c['section'] and merged[-1]['sub'] == c['sub']
            and merged[-1]['text'].startswith('•')):
        merged[-1]['text'] += '\n' + c['text']
        continue
    merged.append(c)
chunks = merged
for i, c in enumerate(chunks): c['id'] = i
json.dump({'document': 'GLPG Employee Handbook & HR Self-Service Manual',
           'version': 'Demo Edition 2.0', 'effective': 'November 3, 2026', 'chunks': chunks},
          open(out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(len(chunks), 'chunks')
