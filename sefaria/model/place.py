from . import abstract as abst
from . import schema

import logging

logger = logging.getLogger(__name__)


class Place(abst.AbstractMongoRecord):
    """
    Homo Sapiens
    """
    collection = 'place'

    required_attrs = [
        "key",
        "names",
        "loc" #Geojason object
    ]
    optional_attrs = [
        "refs",
        "authority"
    ]

    def _normalize(self):
        super(Place, self)._normalize()
        self.names = self.name_group.titles
        if not self.key and self.primary_name("en"):
            self.key = self.primary_name("en")

    # Names
    # This is the same as on TimePeriod, and very similar to Terms - abstract out
    def _init_defaults(self):
        self.name_group = None

    def _set_derived_attributes(self):
        self.name_group = schema.TitleGroup(getattr(self, "names", None))

    def all_names(self, lang=None):
        return self.name_group.all_titles(lang)

    def primary_name(self, lang=None):
        return self.name_group.primary_title(lang)

    def secondary_names(self, lang=None):
        return self.name_group.secondary_titles(lang)


class PlaceSet(abst.AbstractMongoSet):
    recordClass = Place