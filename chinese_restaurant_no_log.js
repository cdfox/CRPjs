
var crpmm = (function () { 
var module = {};

module.sample_table = function(docID, corpus, state) {
	/* 
	Sample a new table
	corpus = {docID: [word, ...], ...}
	state = {
		assignments: {docID: tableID, ...},
		tables: {
			tableID: {
				num_docs: number of documents at this table,
				num_words: number of words among all documents here,
				word_counts: {word: count, ...}		
			},
			...
		},
		total_docs: total number of documents among all tables,
		nextID: an integer ID that is available for a new table,
		alpha: concentration parameter for table sizes,
		beta: concentration parameter for table word distributions,
		W: vocabulary size
	}
	*/

	var words = corpus[docID];

	if (state.assignments.hasOwnProperty(docID)) {
		remove_doc(docID, words, state);
	}

	// build array of unnormalized probabilities for occupied tables
	unnormalized_probabilities = {}	;
	for (var tableID in state.tables) {
		var table = state.tables[tableID];

		var p_o_t = prob_of_table(table.num_docs, 
								  state.total_docs, 
								  state.alpha);

		var p_o_w = prob_of_words_given_table(words, 
											  table.word_counts, 
											  table.num_words, 
											  state.beta, 
											  state.W);

		unnormalized_probabilities[tableID] = p_o_t * p_o_w;
	}

	// add an entry for an unoccupied table
	var p_o_t = prob_of_table(0, state.total_docs, state.alpha);
	var p_o_w = prob_of_words_given_table(words, {}, 0, state.beta, state.W);
	unnormalized_probabilities[state.nextID] = p_o_t * p_o_w;

	// sample new table assignment
	var tableID = sample(unnormalized_probabilities);

	add_doc(docID, words, tableID, state);	
};

module.sample_CRP = function(n, alpha) {
	var counts = {};
	for (var i = 0; i < n; i++) {
		table_probs = {}

		for (var table in counts) {
			prob = prob_of_table(counts[table], i, alpha);
			table_probs[table] = prob;
		}

		// add probability for a new, unoccupied table
		table_probs[i] = prob_of_table(0, i, alpha);

		sampled_table = sample(table_probs);
		if (counts.hasOwnProperty(sampled_table)) {
			counts[sampled_table]++;
		} else {
			counts[sampled_table] = 1;
		}
	}
	return counts;
};

function sample(unnormalized_probabilities) {
	// expects an object of the form {key: probability, ...}
	var random = Math.random();
	var sum = 0;
	for (var key in unnormalized_probabilities) {
		sum += unnormalized_probabilities[key];
	}
	var threshold = random * sum;
	var key;
	for (key in unnormalized_probabilities) {
		threshold -= unnormalized_probabilities[key];
		if (threshold < 0) {
			return key;
		}
	}
	return key;
}

function prob_of_table(count, total, alpha) {
	// count: number of documents at this table
	// total: total number of documents across all tables
	// alpha: concentration parameter for table sizes
	if (count) {
		return count / (total + alpha);
	} else {
		return alpha / (total + alpha);
	}
}

function prob_of_words_given_table(words, word_counts, word_total, beta, W) {
	// words: an array of words
	// word_counts: {word: count, ...}, current word counts for this table
	// word_total: current total number of words at this table
	// beta: concentration parameter for table word distributions
	// W: vocabulary size

	var prob = 1;
	var local_counts = {};
	for (var j = 0; j < words.length; j++) {
		var word = words[j];
		var count, local_count;

		if (word_counts.hasOwnProperty(word)) {
			count = word_counts[word];
		} else {
			count = 0;
		}

		if (local_counts.hasOwnProperty(word)) {
			local_count = local_counts[word];
			local_counts[word]++;
		} else {
			local_count = 0;
			local_counts[word] = 1;
		}

		prob *= (local_count + count + beta) / (j + word_total + W * beta);
	}
	return prob;
}

function remove_doc(docID, words, state) {
	// remove doc from table, adjusting counts accordingly

	var tableID = state.assignments[docID];
	var table = state.tables[tableID];
	for (var i = 0; i < words.length; i++) {
		var word = words[i];
		table.word_counts[word]--;
		if (table.word_counts[word] == 0) {
			delete table.word_counts[word]
		}
	}
	table.num_words -= words.length;
	table.num_docs--;

	// garbage collect old table if this was the only document there
	if (table.num_docs == 0) {
		delete state.tables[tableID];
	}
}

function add_doc(docID, words, tableID, state) {
	// add doc to table, adjusting counts accordingly

	state.assignments[docID] = tableID;

	if (!state.tables.hasOwnProperty(tableID)) {
		state.nextID++;
		state.tables[tableID] = {
			num_docs: 0,
			num_words: 0,
			word_counts: {}
		}
	}

	var table = state.tables[tableID];

	var word_counts = table.word_counts;
	for (var i = 0; i < words.length; i++) {
		var word = words[i];
		if (word_counts.hasOwnProperty(word)) {
			word_counts[word]++;
		} else {
			word_counts[word] = 1;
		}
	}

	table.num_docs++;
	table.num_words += words.length;
	state.total_docs++;
}

return module; }());
