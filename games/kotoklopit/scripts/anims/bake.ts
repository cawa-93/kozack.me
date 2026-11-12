// Заміна анімацій у коді групи (`src/view/rig/anims/<скелет>/<група>.ts`) на готові дані (§2.1, «Анімація»): код групи
// рахує доріжки будівниками під час завантаження модуля, а збирання кладе в модуль уже пораховане.
//
// Що робить `bakeGroup` (за деревом розбору, не за текстом):
// - у кожному експортованому словнику `defineAnims(скелет, { … })` значення-вираз стає посиланням на готову анімацію, а
//   значення-назва сталої верхнього рівня лишається, зате посиланням стає ініціалізатор цієї сталої. Тож анімація — той
//   самий об'єкт скрізь, де вона була одним об'єктом у коді: у словнику, у сталій і в усьому, що на сталу посилається;
// - сталі й функції верхнього рівня, до яких після цього не дістатися від експортів і виразів верхнього рівня (пози,
//   будівники доріжок), зникають: збирач сам їх не викине, бо їхні ініціалізатори — виклики.
// Пастка другого кроку: ініціалізатор сталої, що зникає, не виконується — якщо він мав побічну дію, потрібну решті
// модуля, готовий модуль поведеться інакше. `tests/animbake.test.ts` порівнює готові модулі з кодом.
//
// Чого функція не розуміє (розгортання в словнику, enum, зайнята назва) — помилка: збірка падає, а не лишає групу кодом.
//
// Цей файл Node завантажує сам (його імпортує `plugin.ts`): лише `vite`, без коду гри.

import { parseAst } from "vite";

/** Готові дані групи: текст `packAnims` (`src/view/rig/animpack.ts`) і номер кореня кожної анімації кожного словника. */
export interface GroupData {
  text: string;
  /** Назва експорту словника → назва анімації → номер кореня в тексті. */
  dicts: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export interface BakeOptions {
  /** Адреса модуля `animpack.ts` для імпорту з коду групи. */
  unpack: string;
  /** Назва файлу групи — для повідомлень про помилки. */
  file: string;
}

/** Назви, які функція додає в модуль. */
const ANIMS = "__anims";
const UNPACK = "__unpackAnims";
const DEFINE = "defineAnims";

interface AstNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

const isNode = (value: unknown): value is AstNode => typeof value === "object" && value !== null && typeof (value as AstNode).type === "string";
const child = (node: AstNode, key: string): AstNode | null => (isNode(node[key]) ? node[key] : null);
const children = (node: AstNode, key: string): AstNode[] => (Array.isArray(node[key]) ? (node[key] as unknown[]).filter(isNode) : []);

/** Обгортки TypeScript довкола виразу: значення — у `expression`, решта — типи. */
const TS_WRAPPERS = new Set(["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion", "TSInstantiationExpression"]);
/** Синтаксис TypeScript, що дає код, а не лише типи: його зв'язків функція не простежить. */
const TS_RUNTIME = new Set(["TSEnumDeclaration", "TSModuleDeclaration", "TSImportEqualsDeclaration", "TSExportAssignment", "TSParameterProperty"]);
const TYPE_DECLARATIONS = new Set(["TSTypeAliasDeclaration", "TSInterfaceDeclaration"]);

/**
 * Назви, на які посилається код вузла (без типів і без вузлів `skip`). За назвою, без областей видимості: локальна
 * змінна з назвою сталої верхнього рівня вважається посиланням на неї — зайве лишиться, потрібне не зникне.
 */
function references(node: unknown, skip: ReadonlySet<AstNode>, out: Set<string>, fail: (message: string) => never): void {
  if (Array.isArray(node)) {
    for (const item of node) references(item, skip, out, fail);
    return;
  }
  if (!isNode(node) || skip.has(node)) return;
  const type = node.type;
  if (type === "Identifier") {
    out.add(node["name"] as string);
    return;
  }
  if (TS_RUNTIME.has(type)) fail(`синтаксис ${type} не підтримується`);
  if (TS_WRAPPERS.has(type)) {
    references(node["expression"], skip, out, fail);
    return;
  }
  if (type.startsWith("TS")) return;
  if (type === "MemberExpression") {
    references(node["object"], skip, out, fail);
    if (node["computed"] === true) references(node["property"], skip, out, fail);
    return;
  }
  if (type === "Property" || type === "MethodDefinition" || type === "PropertyDefinition" || type === "AccessorProperty") {
    if (node["computed"] === true) references(node["key"], skip, out, fail);
    references(node["value"], skip, out, fail);
    return;
  }
  for (const key in node) references(node[key], skip, out, fail);
}

/** Назви, які оголошує візерунок зв'язування (`a`, `{ a, b: [c] }`, `...rest`). */
function bound(pattern: AstNode | null, out: string[]): void {
  if (!pattern) return;
  switch (pattern.type) {
    case "Identifier":
      out.push(pattern["name"] as string);
      break;
    case "ObjectPattern":
      for (const property of children(pattern, "properties")) bound(property.type === "RestElement" ? child(property, "argument") : child(property, "value"), out);
      break;
    case "ArrayPattern":
      for (const element of children(pattern, "elements")) bound(element, out);
      break;
    case "AssignmentPattern":
      bound(child(pattern, "left"), out);
      break;
    case "RestElement":
      bound(child(pattern, "argument"), out);
      break;
  }
}

/** Твердження верхнього рівня: що оголошує, чи може зникнути й чи з нього починається пошук потрібного. */
interface Statement {
  node: AstNode;
  names: string[];
  /** Стала чи функція без експорту: зникає, якщо на неї ніхто не посилається. */
  prunable: boolean;
  /** Імпорти й оголошення типів: лишаються як є й нічого не тримають. */
  inert: boolean;
}

function statementOf(node: AstNode): Statement {
  const declared = (declaration: AstNode): string[] => {
    const names: string[] = [];
    if (declaration.type === "VariableDeclaration") for (const declarator of children(declaration, "declarations")) bound(child(declarator, "id"), names);
    else bound(child(declaration, "id"), names);
    return names;
  };
  if (node.type === "ImportDeclaration") {
    const names: string[] = [];
    for (const specifier of children(node, "specifiers")) bound(child(specifier, "local"), names);
    return { node, names, prunable: false, inert: true };
  }
  if (TYPE_DECLARATIONS.has(node.type)) return { node, names: [], prunable: false, inert: true };
  if (node.type === "VariableDeclaration" || node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") {
    return { node, names: declared(node), prunable: node["declare"] !== true, inert: false };
  }
  if (node.type === "ExportNamedDeclaration") {
    const declaration = child(node, "declaration");
    if (node["exportKind"] === "type" || (declaration && TYPE_DECLARATIONS.has(declaration.type))) return { node, names: [], prunable: false, inert: true };
    return { node, names: declaration ? declared(declaration) : [], prunable: false, inert: false };
  }
  return { node, names: [], prunable: false, inert: false };
}

/** Текст рядком JavaScript в апострофах: у JSON їх майже немає, а подвійні лапки — на кожному ключі. */
const quoted = (text: string): string => `'${text.replace(/[\\']/g, "\\$&")}'`;

/**
 * Код групи з готовими даними замість будівників. Модуль без словників анімацій (у даних їх теж немає) — без змін.
 * Помилка — якщо словники коду й даних не збігаються чи код записано так, як функція не розуміє.
 */
export function bakeGroup(code: string, data: GroupData, options: BakeOptions): string {
  const fail = (message: string): never => {
    throw new Error(`Готові анімації, ${options.file}: ${message}`);
  };
  const program = parseAst(code, { lang: "ts" }) as unknown as AstNode;
  const statements = children(program, "body").map(statementOf);
  const owner = new Map<string, Statement>();
  for (const statement of statements) for (const name of statement.names) owner.set(name, statement);

  /** Ініціалізатор сталої верхнього рівня за назвою (лише `const назва = вираз`). */
  const constants = new Map<string, AstNode>();
  for (const { node } of statements) {
    const declaration = node.type === "ExportNamedDeclaration" ? child(node, "declaration") : node;
    if (declaration?.type !== "VariableDeclaration" || declaration["kind"] !== "const") continue;
    for (const declarator of children(declaration, "declarations")) {
      const id = child(declarator, "id");
      const init = child(declarator, "init");
      if (id?.type === "Identifier" && init) constants.set(id["name"] as string, init);
    }
  }

  // Вузли, замість яких стає посилання на готову анімацію, і номер її кореня.
  const baked = new Map<AstNode, number>();
  const found = new Set<string>();
  for (const { node } of statements) {
    if (node.type !== "ExportNamedDeclaration") continue;
    const declaration = child(node, "declaration");
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const declarator of children(declaration, "declarations")) {
      const id = child(declarator, "id");
      const init = child(declarator, "init");
      const callee = init?.type === "CallExpression" ? child(init, "callee") : null;
      if (id?.type !== "Identifier" || !init || callee?.type !== "Identifier" || callee["name"] !== DEFINE) continue;
      // Позиції вузлів — у символах рядка: інакше кирилиця в коментарях зсунула б усі заміни.
      if (code.slice(callee.start, callee.end) !== DEFINE) fail("позиції дерева розбору не збігаються з текстом");
      const dict = id["name"] as string;
      const indexes = data.dicts[dict];
      if (!indexes) fail(`словника «${dict}» немає в готових даних`);
      const literal = children(init, "arguments")[1];
      if (literal?.type !== "ObjectExpression") fail(`«${dict}»: другий аргумент ${DEFINE} має бути записаний об'єктом`);
      const properties = children(literal as AstNode, "properties");
      const seen = new Set<string>();
      for (const property of properties) {
        const key = child(property, "key");
        const value = child(property, "value");
        const name = key?.type === "Identifier" ? (key["name"] as string) : key?.type === "Literal" && typeof key["value"] === "string" ? key["value"] : null;
        if (property.type !== "Property" || property["computed"] === true || property["method"] === true || property["kind"] !== "init" || name === null || !value) {
          return fail(`«${dict}»: у словнику — лише записи «назва: анімація»`);
        }
        const index = (indexes as Record<string, number>)[name];
        if (index === undefined || seen.has(name)) return fail(`«${dict}.${name}»: анімації немає в готових даних чи назва повторюється`);
        seen.add(name);
        let target = value;
        if (value.type === "Identifier") {
          const init = constants.get(value["name"] as string);
          if (!init) return fail(`«${dict}.${name}»: «${String(value["name"])}» — не стала верхнього рівня цього модуля`);
          target = init;
        }
        const known = baked.get(target);
        if (known !== undefined && known !== index) fail(`«${dict}.${name}»: та сама стала — дві різні анімації в готових даних`);
        baked.set(target, index);
      }
      if (seen.size !== Object.keys(indexes as object).length) fail(`«${dict}»: у готових даних більше анімацій, ніж у коді`);
      found.add(dict);
    }
  }
  for (const dict of Object.keys(data.dicts)) if (!found.has(dict)) fail(`словник «${dict}» є в готових даних, але в коді це не ${DEFINE}(…)`);
  if (found.size === 0) return code;
  if (owner.has(ANIMS) || owner.has(UNPACK)) fail(`назви ${ANIMS} і ${UNPACK} зайняті`);

  // Потрібне: усе, до чого можна дійти від експортів і виразів верхнього рівня, оминаючи замінені вирази.
  const skip = new Set(baked.keys());
  const needed = new Set<Statement>();
  const queue = statements.filter((statement) => !statement.prunable && !statement.inert);
  for (let statement = queue.pop(); statement; statement = queue.pop()) {
    if (needed.has(statement)) continue;
    needed.add(statement);
    const names = new Set<string>();
    references(statement.node, skip, names, fail);
    for (const name of names) {
      const next = owner.get(name);
      if (next && !next.inert && !needed.has(next)) queue.push(next);
    }
  }

  const edits: { start: number; end: number; text: string }[] = [];
  for (const statement of statements) if (statement.prunable && !needed.has(statement)) edits.push({ start: statement.node.start, end: statement.node.end, text: "" });
  const removed = [...edits];
  for (const [node, index] of baked) {
    if (!removed.some((edit) => edit.start <= node.start && node.end <= edit.end)) edits.push({ start: node.start, end: node.end, text: `${ANIMS}[${index}]` });
  }
  edits.sort((a, b) => b.start - a.start);
  let out = code;
  for (const edit of edits) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return `import { unpackAnims as ${UNPACK} } from ${JSON.stringify(options.unpack)};\nconst ${ANIMS} = /*#__PURE__*/ ${UNPACK}(${quoted(data.text)});\n${out}`;
}
