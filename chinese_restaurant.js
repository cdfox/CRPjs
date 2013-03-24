/*
Chinese Restaurant Process Mixture Model for Document Clustering

An infinite mixture model for documents, in which each document sits at a 
table (a mixture component in the CRP metaphor) and a table-specific unigram 
language model generates the words in the document. To generate a document
corpus with vocabulary of size W, number of documents N, and document lengths 
(in words) M_d:

- For each table 1, 2, ...:
	- Sample a distribution over the vocabulary phi_t ~ Dirichlet(W, beta)
- Sample a seating arrangement {t_1, ..., t_N} ~ CRP(alpha), where t_d is the
  table assignment for document d
- For each document d:
	- For each word position m = 1, ..., M_d:
		- Sample a word w_{d,m} ~ Multinomial(phi_{t_d})
*/

var crpmm = (function () { 
var crpmm = {};

crpmm.initialize_state = function(corpus, alpha, beta) {
	/* Initalize state so that each doc is seated at its own table.
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

	var state = {
		assignments: {},
		tables: {},
		total_docs: 0,
		nextID: 0,
		W: 0,
		alpha: alpha,
		beta: beta,
		vocab: {},
	}
	for (var docID in corpus) {
		var words = corpus[docID];
		for (var position in words) {
			var word = words[position];
			if (state.vocab.hasOwnProperty(word)) {
				state.vocab[word]++;
			} else {
				state.W++;
				state.vocab[word] = 1;
			}
		}
		add_doc(docID, words, state.nextID, state);
	}
	return state;
}

crpmm.sample_table = function(docID, corpus, state) {
	// Sample a new table for document docID

	var words = corpus[docID];

	if (state.assignments.hasOwnProperty(docID)) {
		remove_doc(docID, words, state);
	}

	// build array of unnormalized probabilities for occupied tables
	log_un_ps = [];
	for (var tableID in state.tables) {
		var table = state.tables[tableID];

		var lpt = log_prob_table(table.num_docs, 
								 state.total_docs, 
								 state.alpha);

		var lpw = log_prob_words_given_table(words, 
											 table.word_counts, 
											 table.num_words, 
											 state.beta, 
											 state.W);

		log_un_ps.push([lpt + lpw, tableID]);
	}

	// add an entry for an unoccupied table
	var lpt = log_prob_table(0, state.total_docs, state.alpha);
	var lpw = log_prob_words_given_table(words, {}, 0, state.beta, state.W);
	log_un_ps.push([lpt + lpw, state.nextID]);

	// sample new table assignment
	var tableID = log_sample(log_un_ps);

	add_doc(docID, words, tableID, state);	
};

function log_sample(log_un_ps) {
	// log_un_ps: [[log unnormalized probability, tableID], ...]

	log_un_ps.sort();
	var max = log_un_ps[0][0];

	// finding the log of the normalization constant
	// see http://blog.smola.org/post/987977550/log-probabilities-semirings-and-floating-point-numbers
	var sum = 0;
	for (var i in log_un_ps) {
		sum += Math.exp(log_un_ps[i][0] - max);
	}
	var log_norm_const = max + Math.log(sum);

	var random = Math.log(Math.random());

	var sum_of_exp = 0;
	for (var i in log_un_ps) {
		sum_of_exp += Math.exp(log_un_ps[i][0] - max);	
		var log_cumulative_prob = max + Math.log(sum_of_exp) - log_norm_const;
		if (log_cumulative_prob > random) {
			return log_un_ps[i][1];
		}
	}
	return log_un_ps[log_un_ps.length - 1][1];
};

function log_prob_table(count, total, alpha) {
	// count: number of documents at this table
	// total: total number of documents across all tables
	// alpha: concentration parameter for table sizes
	if (count) {
		return Math.log(count / (total + alpha));
	} else {
		return Math.log(alpha / (total + alpha));
	}
}

function log_prob_words_given_table(words, word_counts, word_total, beta, W) {
	// words: an array of words
	// word_counts: {word: count, ...}, current word counts for this table
	// word_total: current total number of words at this table
	// beta: concentration parameter for table word distributions
	// W: vocabulary size

	var log_prob = 0;
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

		log_prob += Math.log((local_count + count + beta) / 
						(j + word_total + W * beta));
	}
	return log_prob;
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

return crpmm; }());
