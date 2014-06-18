"""
counts.py - functions for counting and the number of available segments and versions of a text.

Writes to MongoDB Collection: counts

Counts documents exist for each text as well as each category of texts. Documents for 
texts are keyed by the 'title' field, documents for categories are keyed by the 'categories'
field, which is an array of strings.
"""
from collections import defaultdict
from pprint import pprint

import texts
import summaries
from util import *
from database import db


def count_texts(ref, lang=None):
	"""
	Count available versions of a text in the db, segment by segment.
	"""
	counts = []

	pref = texts.parse_ref(ref)
	if "error" in pref:
		return pref
	depth = pref["textDepth"]

	query = { "title": pref["book"] }

	if lang:
		query["language"] = lang

	all_texts = db.texts.find(query)
	for text in all_texts:
		# TODO Look at the sections requested in ref, not just total book
		this_count = count_array(text["chapter"])
		counts = sum_count_arrays(counts, this_count)

	result = { "counts": counts, "lengths": [], "sectionNames": pref["sectionNames"] }
	#result = dict(result.items() + pref.items()

	for d in range(depth):
		result["lengths"].append(sum_counts(counts, d))

	return result


def update_counts(ref=None):
	"""
	Update the count records of all texts or the text specfied 
	by ref (currently at book level only) by peforming a count
	"""
	if ref:
 		update_text_count(ref)
		return

	indices = db.index.find({})

	for index in indices:
		if index["categories"][0] == "Commentary":
			cRef = "^" + index["title"] + " on "
			texts = db.texts.find({"title": {"$regex": cRef}})
			for text in texts:
				update_text_count(text["title"], index)
		else:	
			update_text_count(index["title"])

	summaries.update_summaries()


def update_text_count(ref, index=None):
	"""
	Update the count records of the text specfied 
	by ref (currently at book level only) by peforming a count
	"""	
	index = texts.get_index(ref)
	if "error" in index:
		return index

	c = { "title": ref }
	db.counts.remove(c)

	if index["categories"][0] in ("Tanach", "Mishnah", "Talmud"):
		# For these texts, consider what is present in the db across 
		# English and Hebrew to represent actual total counts
		counts = count_texts(ref)
		if "error" in counts:
			return counts
		c["sectionCounts"] = zero_jagged_array(counts["counts"])

	en = count_texts(ref, lang="en")
	if "error" in en:
		return en
	he = count_texts(ref, lang="he")
	if "error" in he:
		return he

	if "sectionCounts" in c:
		totals = c["sectionCounts"]
	else:
		totals = zero_jagged_array(sum_count_arrays(en["counts"], he["counts"]))

	enCount = sum_count_arrays(en["counts"], totals)
	heCount = sum_count_arrays(he["counts"], totals) 

	c["availableTexts"] = {
		"en": enCount,
		"he": heCount,
	}

	c["availableCounts"] = {
		"en": en["lengths"],
		"he": he["lengths"],
	}

	if "length" in index and "lengths" in index:
		depth = len(index["lengths"])
		heTotal = enTotal = total = 0
		for i in range(depth):
			heTotal += he["lengths"][i]
			enTotal += en["lengths"][i]
			total += index["lengths"][i]
		if total == 0:
			hp = ep = 0
		else:
			hp = heTotal / float(total) * 100
			ep = enTotal / float(total) * 100
	else: 
		hp = ep = 0

	c["percentAvailable"] = {
		"he": hp,
		"en": ep,
	}
	c["textComplete"] = {
		"he": hp > 99.9,
		"en": ep > 99.9,
	}

	db.counts.save(c)
	return c


def count_category(cat, lang=None):
	"""
	Count the number of sections of various types in an entire category and calculate percentages
	Depends on text counts already being saved in counts collection
	"""
	if not lang:
		# If no language specified, return a dict with English and Hebrew,
		# grouping hebrew and english fields
		cat = [cat] if isinstance(cat, basestring) else cat
		en = count_category(cat, "en")
		he = count_category(cat, "he")
		counts = {
					"percentAvailable": { 
						"he": he["percentAvailable"], 
						"en": en["percentAvailable"]
						},
					"availableCounts": {
						"he": he["availableCounts"],
						"en": en["availableCounts"]
						}
				}
		counts["textComplete"] = {
			"he": he["percentAvailable"] > 99.5,
			"en": en["percentAvailable"] > 99.5,
		}
		
		# Save to the DB
		remove_doc = {"$and": [{'categories.0': cat[0]}, {"categories": {"$all": cat}}, {"categories": {"$size": len(cat)}} ]}
		db.counts.remove(remove_doc)
		counts_doc = {"categories": cat}
		counts_doc.update(counts)
		db.counts.save(counts_doc)

		return counts


	# Cout this cateogry
	counts = defaultdict(int)
	percent = 0.0
	percentCount = 0
	cat = [cat] if isinstance(cat, basestring) else cat
	texts = db.index.find({"$and": [{'categories.0': cat[0]}, {"categories": {"$all": cat}}]})
	for text in texts:
		counts["Text"] += 1
		text_count = db.counts.find_one({ "title": text["title"] })
		if not text_count or "availableCounts" not in text_count or "sectionNames" not in text:
			continue
	
		c = text_count["availableCounts"][lang]
		for i in range(len(text["sectionNames"])):
			if len(c) > i:
				counts[text["sectionNames"][i]] += c[i]
	
		if "percentAvailable" in text_count and isinstance(percent, float):
			percentCount += 1
			percent += text_count["percentAvailable"][lang] if isinstance(text_count["percentAvailable"][lang], float) else 0.0
		else:
			percent = "unknown"

	percentCount = 1 if percentCount == 0 else percentCount
	percent = percent / percentCount if isinstance(percent, float) else "unknown"

	if "Daf" in counts:
		counts["Amud"] = counts["Daf"]
		counts["Daf"] = counts["Daf"] / 2

	return { "availableCounts": dict(counts), "percentAvailable": percent }


def get_category_count(categories):
	"""
	Returns the counts doc stored in the matching category list 'categories'
	"""
	# This ugly query is an approximation for the extact array in order
	# WARNING: This query get confused is we ever have two lists of categories which have 
	# the same length, elements, and first element, but different order. (e.g ["a", "b", "c"] and ["a", "c", "b"])
	doc = db.counts.find_one({"$and": [{'categories.0': categories[0]}, {"categories": {"$all": categories}}, {"categories": {"$size": len(categories)}} ]})
	if doc:
		del doc["_id"]

	return doc


def update_category_counts():
	"""
	Recounts all category docs and saves to the DB.
	"""
	categories = set()
	indices = db.index.find()
	for index in indices:
		for i in range(len(index["categories"])):
			# perform a count for each sublist. E.g, for ["Talmud", "Bavli", "Seder Zeraim"]
			# also count ["Talmud"] and ["Talmud", "Bavli"]
			categories.add(tuple(index["categories"][0:i+1]))

	categories = [list(cats) for cats in categories]
	for cats in categories:
		count_category(cats)


def count_array(text):
	"""
	Returns an array which corresponds to 'text' that counts whether or not 
	text is present in each position - 1 for text, 0 for empty.
	"""
	if isinstance(text, basestring) or text is None:
		return 0 if not text else 1
	else:
		return [count_array(t) for t in text]


def sum_count_arrays(a, b):
	"""
	Returns a multi-dimensional array which sums each position of
	two multidimensional arrays of ints. Missing elements are given 0 value.
	[[1, 2], [3, 4]] + [[2,3], [4]] = [[3, 5], [7, 4]]
	"""
	# Treat None as 0 
	if a is None:
		return sum_count_arrays(0, b) 
	if b is None:
		return sum_count_arrays(a, 0) 

	# If one value is an int while the other is a list, 
	# Treat the int as an empty list. 
	# Needed e.g, when a whole chapter is missing appears as 0
	if isinstance(a, int) and isinstance(b, list):
		return sum_count_arrays([],b)
	if isinstance(b, int) and isinstance(a, list):
		return sum_count_arrays(a,[])

	# If both are ints, return the sum
	if isinstance(a, int) and isinstance(b, int):
		return a + b
	# If both are lists, recur on each pair of values
	# map results in None value when element not present
	if isinstance(a, list) and isinstance(b, list):
		return [sum_count_arrays(a2, b2) for a2, b2 in map(None, a, b)]	

	return "sum_count_arrays reached a condition it shouldn't have reached"


def sum_counts(counts, depth):
	"""
	Sum the counts of a text at given depth to get the total number of a given kind of section
	E.g, for counts on all of Job, depth 0 counts chapters, depth 1 counts verses
	"""
	if depth == 0:
		if isinstance(counts, int):
			# if we're looking at a 
			return min(counts, 1)
		else:
			sum = 0
			for i in range(len(counts)):
				sum += min(sum_counts(counts[i], 0), 1)
			return sum
	else:
		sum = 0
		for i in range(len(counts)):
			sum += sum_counts(counts[i], depth-1)
		return sum


def zero_jagged_array(array):
	"""
	Returns a jagged array of identical shape to 'array'
	with all elements replaced by 0.
	"""
	if isinstance(array, list):
		return [zero_jagged_array(a) for a in array]
	else:
		return 0


def count_words_in_texts(curr):
	"""
	Counts all the words of texts in curr.
	"""
	total = sum([count_words(t["chapter"]) for t in curr ])
	return total


def count_words(text):
	"""
	Counts the number of words in a jagged array whose terminals are strings.
	"""
	if isinstance(text, basestring):
		return len(text.split(" "))
	elif isinstance(text, list):
		return sum([count_words(i) for i in text])
	else:
		return 0


def count_characters_in_texts(curr):
	"""
	Counts all the characters of texts in curr.
	"""
	total = sum([count_characters(t["chapter"]) for t in curr ])
	return total


def count_characters(text):
	"""
	Counts the number of characters in a jagged array whose terminals are strings.
	"""
	if isinstance(text, basestring):
		return len(text)
	elif isinstance(text, list):
		return sum([count_words(i) for i in text])
	else:
		return 0


def get_percent_available(text, lang="en"):
	"""
	Returns the percentage of 'text' available in 'lang',
	where text is a text title, text category or list of categories. 
	"""
	c = get_counts_doc(text)

	if c and lang in c["percentAvailable"]:
		return c["percentAvailable"][lang]
	else:
		return 0


def get_available_counts(text, lang="en"):
	"""
	Returns the available counts dictionary of 'text' in 'lang',
	where text is a text title, text category or list of categories.

	The avalable counts dictionary counts the number of sections availble in 
	a text, keyed by the various section names which apply to it.
	"""
	c = get_counts_doc(text)
	if not c:
		return None

	if "title" in c:
		# count docs for individual texts have different shape
		i = db.index.find_one({"title": c["title"]})
		c["availableCounts"] = make_available_counts_dict(i, c)

	if c and lang in c["availableCounts"]:
		return c["availableCounts"][lang]
	else:
		return None


def get_counts_doc(text):
	"""
	Returns the stored count doc for 'text',
	where text is a text title, text category or list of categories. 
	"""	
	if isinstance(text, list):
		# text is a list of categories
		return get_category_count(text)
	
	categories = texts.get_text_categories()
	if text in categories:
		# text is a single category name
		return get_category_count([text])

	# Treat 'text' as a text title
	query = {"title": text}
	c = db.counts.find_one(query)
	return c


def make_available_counts_dict(index, count):
	"""
	For index and count doc for a text, return a dictionary 
	which zips together section names and available counts. 
	Special case Talmud. 
	"""
	counts = {"en": {}, "he": {} }
	if count and "sectionNames" in index and "availableCounts" in count:
		for num, name in enumerate(index["sectionNames"]):
			if "Talmud" in index["categories"] and name == "Daf":
				counts["he"]["Amud"] = count["availableCounts"]["he"][num]
				counts["he"]["Daf"]  = counts["he"]["Amud"] / 2
				counts["en"]["Amud"] = count["availableCounts"]["en"][num]
				counts["en"]["Daf"]  = counts["en"]["Amud"] / 2
			else:
				counts["he"][name] = count["availableCounts"]["he"][num]
				counts["en"][name] = count["availableCounts"]["en"][num]
	
	return counts


def get_untranslated_count_by_unit(text, unit):
	"""
	Returns the (approximate) number of untranslated units of text,
	where text is a text title, text category or list of categories,
	and unit is a section name to count.

	Counts are approximate because they do not adjust for an English section
	that may have no corresponding Hebrew.
	"""
	he = get_available_counts(text, lang="he")
	en = get_available_counts(text, lang="en")

	return he[unit] - en[unit]


def get_translated_count_by_unit(text, unit):
	"""
	Return the (approximate) number of translated units in text,
	where text is a text title, text category or list of categories,
	and unit is a section name to count.

	Counts are approximate because they do not adjust for an English section
	that may have no corresponding Hebrew.
	"""
	en = get_available_counts(text, lang="en")

	return en[unit]


def is_ref_available(ref, lang):
	"""
	Returns True if at least one complete version of ref is available in lang.
	"""
	p = texts.parse_ref(ref)
	if "error" in p:
		return False
	counts_doc = get_counts_doc(p["book"])
	if not counts_doc:
		counts_doc = update_text_count(p["book"])
	counts = counts_doc["availableTexts"][lang]

	segment = texts.grab_section_from_text(p["sections"], counts, toSections=p["toSections"])

	if not isinstance(segment, list):
		segment = [segment]
	return all(segment)


def is_ref_translated(ref):
	"""
	Returns True if at least one complete version of ref is available in English.
	"""
	return is_ref_available(ref, "en")


def generate_refs_list(query={}):
	"""
	Generate a list of refs to all available sections.
	"""
	refs = []
	counts = db.counts.find(query)
	for c in counts:
		if "title" not in c:
			continue # this is a category count

		i = texts.get_index(c["title"])
		if ("error" in i):
			# If there is not index record to match the count record,
			# the count should be removed.
			db.counts.remove(c)
			continue
		title = c["title"]
		he = list_from_counts(c["availableTexts"]["he"])
		en = list_from_counts(c["availableTexts"]["en"])
		sections = union(he, en)
		for n in sections:
			if i["categories"][0] == "Talmud":
				n = texts.section_to_daf(int(n))
			if "commentaryCategories" in i and i["commentaryCategories"][0] == "Talmud":
				split = n.split(":")
				n = ":".join([texts.section_to_daf(int(n[0]))] + split[1:])
			ref = "%s %s" % (title, n) if n else title
			refs.append(ref)

	return refs


def list_from_counts(count, pre=""):
	"""
	Recursive function to transform a count array (a jagged array counting
	how many versions of each text segment are availble) into a list of
	available sections numbers.

	A section is considered available if at least one of its segments is available.

	E.g., [[1,1],[0,1]]	-> [1,2]
	      [[0,0], [1,0]] -> [2]
		  [[[1,2], [0,1]], [[0,0], [1,0]]] -> [1:1, 1:2, 2:2]
	"""
	urls = []

	if not count:
		return urls

	elif isinstance(count[0], int):
		# The count we're looking at represents a section
		# List it in urls if it not all empty
		if not all(v == 0 for v in count):
			urls.append(pre)
			return urls

	for i, c in enumerate(count):
		if isinstance(c, list):
			p = "%s:%d" % (pre, i+1) if pre else str(i+1)
			urls += list_from_counts(c, pre=p)

	return urls
