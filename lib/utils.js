export function attributesToMap(attributes) {
    return Object.fromEntries([...attributes].map(at => [at.name, at.value]))
}