from slugify import slugify
assert slugify('  Hello,   World!!  ') == 'hello-world'
assert slugify('ATLAS_ai') == 'atlas-ai'
