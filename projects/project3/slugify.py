import re

def slugify(s):
    return re.sub(r'\W+', '-', s.lower()).strip('-')
