"""Search vocabulary for the style browser, used by build-pages-mvp.py.

QUICK_TAGS: the visual tag chips under the category filter. A style gets a tag
when any of its terms starts a word in the style's name, summary or slug.
"""

QUICK_TAGS = [
    ("Portrait", ["portrait", "face", "close-up", "headshot"]),
    ("Manga & Comic", ["manga", "comic", "anime"]),
    ("Hand-drawn", ["doodle", "scribble", "marker", "crayon", "hand-drawn", "sketch"]),
    ("Halftone & Print", ["halftone", "riso", "xerox", "screenprint", "print"]),
    ("Retro", ["retro", "vintage", "y2k", "70s", "80s", "90s", "analog"]),
    ("Neon", ["neon", "acid", "fluorescent"]),
    ("Monochrome", ["monochrome", "black-and-white", "duotone", "noir"]),
    ("3D", ["3d", "clay", "inflat", "toy", "render"]),
    ("Mascot", ["mascot", "creature", "monster", "pet"]),
    ("Sport", ["sport", "athlete", "runner", "basketball", "football", "cycling", "racing", "motorsport", "skate", "volley"]),
    ("Food", ["food", "snack", "ramen", "coffee", "dessert", "drink", "tea", "meal"]),
    ("Fashion", ["fashion", "streetwear", "outfit", "wardrobe"]),
    ("Product", ["product", "sneaker", "footwear", "packaging", "launch"]),
]

# Style families: variant sets of one style show as a single gallery card.
# Slugs ending in -set-NN or -part-NN join the family named by the part before
# that suffix automatically. List only exceptions here: slug -> family key.
FAMILY_OVERRIDES = {
    "monumental-sport-editorial": "monumental-editorial",
}
