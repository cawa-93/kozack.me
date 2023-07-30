export const css = `
.search {
  background: gray;
  padding: 20px;
}
`;

export const js = 'alert("ПРИВІТ!")'


export default function ({ comp }) {
    return <form className="search">
        <label>
            Search:
            <input type="search" name="q"/>
        </label>
        <button type="submit">Submit</button>
    </form>
}