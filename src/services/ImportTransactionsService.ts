import csvParse from 'csv-parse';
import fs from 'fs';
import { getCustomRepository, getRepository, In } from 'typeorm';
import Category from '../models/Category';
import Transaction from '../models/Transaction';
import TransactionsRepository from '../repositories/TransactionsRepository';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);
    const contactsReadStream = fs.createReadStream(filePath);

    // função com métodos csvParse
    const parsers = csvParse({
      from_line: 2,
    });

    // conforme a linha estiver disponível para leitura ele lerá
    const parseCSV = contactsReadStream.pipe(parsers);

    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];

    // mapeia o arquivo e salva nas variáveis de cima
    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) return;

      categories.push(category);

      // transaction com todos os valores lidos
      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    // mapear as categorias no db

    const existentCategories = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    const existentCategoriesTitles = existentCategories.map(
      (category: Category) => category.title,
    );

    // mapeia tudo e busca um index que o value seja igual e ele retira pelo filter não ocorre duplicata
    const addCategoryTitles = categories
      .filter(category => !existentCategoriesTitles.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    // adiciona a categoria mapeia cada título dentro da array

    const newCategories = categoriesRepository.create(
      addCategoryTitles.map(title => ({
        title,
      })),
    );

    // no geral Mapeia as categorias do csv cria array com ela filtra se existem duplicadas e dps insere no dv

    await categoriesRepository.save(newCategories);

    // spread operator final categories são todas as categorias mesmos as não criadas no db
    const finalCategories = [...newCategories, ...existentCategories];

    // para cada transaction retorna um objeto com os valores
    const createdTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        // mapeia todas as categories e busca uma category com o mesmo titulo
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionsRepository.save(createdTransactions);

    await fs.promises.unlink(filePath);

    return createdTransactions;

    console.log(addCategoryTitles);
    console.log(existentCategoriesTitles);
    console.log(transactions);
  }

  // quando o evento end ele retorna algo que deve ser feito
}

export default ImportTransactionsService;
