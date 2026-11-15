package clack

func (t *Terminal) Text(options PromptOptions) (string, error) {
	p := t.prompt("text", options)
	err := p.run()

	return p.value, err
}

func (t *Terminal) Password(options PromptOptions) (string, error) {
	p := t.prompt("password", options)
	err := p.run()

	return p.value, err
}

func (t *Terminal) Confirm(options PromptOptions) (bool, error) {
	p := t.prompt("confirm", options)
	err := p.run()

	return p.yes, err
}

func (t *Terminal) Select(options PromptOptions) (string, error) {
	p := t.prompt("select", options)
	err := p.run()
	if len(options.Options) == 0 {
		return "", err
	}

	return options.Options[p.index].Value, err
}

func (t *Terminal) Multiselect(options PromptOptions) ([]string, error) {
	p := t.prompt("multiselect", options)
	err := p.run()
	var result []string
	for _, o := range options.Options {
		if p.selected[o.Value] {
			result = append(result, o.Value)
		}
	}

	return result, err
}
